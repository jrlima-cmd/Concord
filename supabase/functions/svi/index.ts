// API do SVI na Supabase Edge Functions: mesmas rotas do servidor Node (src/app.js),
// com pedidos e ingressos no Postgres do projeto.
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const env = (name: string, fallback = '') => Deno.env.get(name) ?? fallback;

const config = {
    stripeSecretKey: env('STRIPE_SECRET_KEY'),
    stripeWebhookSecret: env('STRIPE_WEBHOOK_SECRET'),
    stripePaymentMethods: env('STRIPE_PAYMENT_METHODS').split(',').map((m) => m.trim()).filter(Boolean),
    siteUrl: env('SITE_URL').replace(/\/$/, ''),
    eventName: env('EVENT_NAME', 'Ingresso SVI'),
    ticketPriceCents: parseInt(env('TICKET_PRICE_CENTS', '5500'), 10),
    currency: env('CURRENCY', 'brl').toLowerCase(),
    maxTicketsPerOrder: parseInt(env('MAX_TICKETS_PER_ORDER', '10'), 10),
    staffPassword: env('STAFF_PASSWORD'),
    sessionSecret: env('SESSION_SECRET'),
    staffSessionHours: parseInt(env('STAFF_SESSION_HOURS', '12'), 10),
};

function serviceKey(): string {
    const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (legacy) return legacy;
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    return keys.default ?? '';
}

const db = createClient(env('SUPABASE_URL'), serviceKey(), { auth: { persistSession: false } });
const stripe = new Stripe(config.stripeSecretKey || 'sk_missing', {
    httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const TICKET_CODE_PATTERN = /^TK-[A-Z0-9]{6,16}$/;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MINUTES = 5;
// Checkout da Stripe expira em 60 min; limita pedidos abertos por pessoa nesse intervalo
const MAX_PENDING_ORDERS = 5;
const PENDING_WINDOW_MINUTES = 60;
// Pedidos pendentes mais antigos já expiraram na Stripe; não vale consultar de novo
const REFRESH_PENDING_MAX_AGE_MS = 2 * 60 * 60 * 1000;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type, x-staff-token, authorization, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

// ---------- utilitários ----------
const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomToken(size: number): string {
    return base64url(crypto.getRandomValues(new Uint8Array(size)));
}

function randomHex(size: number): string {
    return [...crypto.getRandomValues(new Uint8Array(size))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string): Promise<Uint8Array> {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

/** Comparação em tempo constante (compara os hashes, então o tamanho não vaza). */
async function safeEqual(a: string, b: string): Promise<boolean> {
    const [ha, hb] = await Promise.all([sha256(String(a)), sha256(String(b))]);
    let diff = 0;
    for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i];
    return diff === 0;
}

async function hmac(payload: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        'raw', encoder.encode(config.sessionSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload))));
}

async function issueStaffToken(): Promise<string> {
    const payload = base64url(encoder.encode(JSON.stringify({
        role: 'staff',
        exp: Date.now() + config.staffSessionHours * 60 * 60 * 1000,
    })));
    return `${payload}.${await hmac(payload)}`;
}

async function verifyStaffToken(token: string | null): Promise<boolean> {
    if (!token || !token.includes('.')) return false;
    const [payload, signature] = token.split('.');
    if (!(await safeEqual(signature, await hmac(payload)))) return false;
    try {
        const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
        const data = JSON.parse(atob(padded));
        return data.role === 'staff' && data.exp > Date.now();
    } catch {
        return false;
    }
}

function staffTokenFrom(req: Request): string | null {
    const header = req.headers.get('x-staff-token');
    if (header) return header;
    const auth = req.headers.get('authorization') ?? '';
    return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

/** Usuário logado (Supabase Auth) a partir do header Authorization: Bearer <access token>. */
async function currentUser(req: Request): Promise<{ id: string; email?: string } | null> {
    const auth = req.headers.get('authorization') ?? '';
    if (!auth.startsWith('Bearer ')) return null;
    const { data, error } = await db.auth.getUser(auth.slice(7));
    return error || !data.user ? null : { id: data.user.id, email: data.user.email };
}

const LOGIN_REQUIRED = 'Entre na sua conta para continuar.';

function clientIp(req: Request): string {
    return (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
}

// ---------- pedidos ----------
type Order = {
    id: string;
    user_id: string | null;
    access_token: string;
    stripe_session_id: string | null;
    holder_name: string;
    customer_email: string | null;
    quantity: number;
    amount_total: number;
    currency: string;
    status: string;
    created_at: string;
    paid_at: string | null;
};

async function getOrder(id: string): Promise<Order | null> {
    const { data, error } = await db.from('orders').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
}

async function getOrderBySession(sessionId: string): Promise<Order | null> {
    const { data, error } = await db.from('orders').select('*').eq('stripe_session_id', sessionId).maybeSingle();
    if (error) throw error;
    return data;
}

async function setPendingStatus(orderId: string, status: string) {
    const { error } = await db.from('orders').update({ status }).eq('id', orderId).eq('status', 'PENDING');
    if (error) throw error;
}

function toSqliteLikeDate(value: string | null): string | null {
    // O front-end espera "AAAA-MM-DD HH:MM:SS" em UTC (formato do servidor Node)
    return value ? new Date(value).toISOString().slice(0, 19).replace('T', ' ') : null;
}

async function publicOrder(order: Order) {
    const { data: tickets, error } = await db.from('tickets').select('*').eq('order_id', order.id).order('number');
    if (error) throw error;
    return {
        id: order.id,
        status: order.status,
        holderName: order.holder_name,
        customerEmail: order.customer_email,
        quantity: order.quantity,
        amountTotal: order.amount_total,
        currency: order.currency,
        createdAt: toSqliteLikeDate(order.created_at),
        paidAt: toSqliteLikeDate(order.paid_at),
        tickets: (tickets ?? []).map((t) => ({
            code: t.code,
            number: t.number,
            holderName: t.holder_name,
            status: t.status,
            usedAt: toSqliteLikeDate(t.used_at),
        })),
    };
}

/**
 * Confirma o pedido a partir de uma Checkout Session. Chamado pelo webhook e quando o
 * comprador volta do Checkout, para que os ingressos apareçam mesmo se o webhook atrasar.
 */
async function syncFromSession(session: Stripe.Checkout.Session): Promise<Order | null> {
    const orderId = session.client_reference_id ?? session.metadata?.order_id;
    const order = orderId ? await getOrder(orderId) : await getOrderBySession(session.id);
    if (!order) return null;

    if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
        if (session.amount_total !== order.amount_total || session.currency !== order.currency) {
            console.error(`[SVI] Valor divergente no pedido ${order.id}; ingressos não emitidos.`);
            return order;
        }
        const paymentIntent = typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id ?? null;
        const { error } = await db.rpc('fulfill_order', {
            p_order_id: order.id,
            p_email: session.customer_details?.email ?? null,
            p_payment_intent: paymentIntent,
        });
        if (error) throw error;
    } else if (session.status === 'expired') {
        await setPendingStatus(order.id, 'EXPIRED');
    }
    return await getOrder(order.id);
}

// ---------- rotas ----------
async function handleWebhook(req: Request): Promise<Response> {
    if (!config.stripeWebhookSecret) return json({ error: 'Webhook não configurado' }, 503);

    const body = await req.text();
    let event: Stripe.Event;
    try {
        event = await stripe.webhooks.constructEventAsync(
            body, req.headers.get('stripe-signature') ?? '', config.stripeWebhookSecret, undefined, cryptoProvider,
        );
    } catch (err) {
        console.warn(`[SVI] Assinatura de webhook inválida: ${(err as Error).message}`);
        return json({ error: 'Assinatura inválida' }, 400);
    }

    const session = event.data.object as Stripe.Checkout.Session;
    switch (event.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded':
        case 'checkout.session.expired':
            await syncFromSession(session);
            break;
        case 'checkout.session.async_payment_failed': {
            const order = (session.client_reference_id && await getOrder(session.client_reference_id))
                || await getOrderBySession(session.id);
            if (order) await setPendingStatus(order.id, 'FAILED');
            break;
        }
    }
    return json({ received: true });
}

async function handleCheckout(req: Request): Promise<Response> {
    const user = await currentUser(req);
    if (!user) return json({ error: LOGIN_REQUIRED }, 401);

    const body = await req.json().catch(() => ({}));
    const holderName = String(body?.holderName ?? '').trim().replace(/\s+/g, ' ');
    const quantity = Number(body?.quantity);

    if (holderName.length < 3 || holderName.length > 80) {
        return json({ error: 'Informe o nome completo do titular (3 a 80 caracteres).' }, 400);
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > config.maxTicketsPerOrder) {
        return json({ error: `A quantidade deve ser entre 1 e ${config.maxTicketsPerOrder}.` }, 400);
    }

    // Volta para o site que iniciou a compra (ou para SITE_URL, se definido)
    const returnBase = config.siteUrl || (req.headers.get('origin') ?? '').replace(/\/$/, '');
    if (!/^https?:\/\//.test(returnBase)) {
        return json({ error: 'Defina SITE_URL nas variáveis da função.' }, 500);
    }
    const returnPath = String(body?.returnPath ?? '/').startsWith('/') ? String(body.returnPath ?? '/') : '/';

    // O preço vem sempre do servidor; nunca confiamos em valores enviados pelo navegador
    const order = {
        id: `ord_${randomHex(12)}`,
        access_token: randomToken(24),
    };
    const { data: created, error: insertError } = await db.rpc('create_order_limited', {
        p_id: order.id,
        p_user_id: user.id,
        p_access_token: order.access_token,
        p_holder_name: holderName,
        p_quantity: quantity,
        p_unit_amount: config.ticketPriceCents,
        p_currency: config.currency,
        p_max_pending: MAX_PENDING_ORDERS,
        p_window_minutes: PENDING_WINDOW_MINUTES,
    });
    if (insertError) throw insertError;
    if (!created) {
        return json({
            error: 'Você tem pagamentos em aberto. Conclua um deles ou aguarde até 1 hora para iniciar outro.',
        }, 429);
    }

    try {
        const returnUrl = `${returnBase}${returnPath}?order=${order.id}&token=${order.access_token}`;
        const params: Stripe.Checkout.SessionCreateParams = {
            mode: 'payment',
            client_reference_id: order.id,
            ...(user.email ? { customer_email: user.email } : {}),
            metadata: { order_id: order.id, holder_name: holderName },
            line_items: [{
                quantity,
                price_data: {
                    currency: config.currency,
                    unit_amount: config.ticketPriceCents,
                    product_data: { name: config.eventName, description: `Titular: ${holderName}` },
                },
            }],
            payment_intent_data: {
                description: `${config.eventName} - ${quantity}x - ${holderName}`,
                metadata: { order_id: order.id },
            },
            locale: 'pt-BR',
            success_url: `${returnUrl}&checkout=success`,
            cancel_url: `${returnUrl}&checkout=cancel`,
            expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
        };
        if (config.stripePaymentMethods.length) {
            params.payment_method_types = config.stripePaymentMethods as Stripe.Checkout.SessionCreateParams.PaymentMethodType[];
        }

        const session = await stripe.checkout.sessions.create(params, { idempotencyKey: `checkout-${order.id}` });
        await db.from('orders').update({ stripe_session_id: session.id }).eq('id', order.id);
        return json({ url: session.url, orderId: order.id, accessToken: order.access_token });
    } catch (err) {
        console.error('[SVI] Erro ao criar sessão de Checkout:', (err as Error).message);
        await setPendingStatus(order.id, 'FAILED');
        return json({ error: 'Não foi possível iniciar o pagamento. Tente novamente em instantes.' }, 502);
    }
}

/** Se o pedido ainda está pendente, consulta a Stripe diretamente (fallback do webhook). */
async function refreshPending(order: Order): Promise<Order> {
    if (order.status !== 'PENDING' || !order.stripe_session_id) return order;
    if (Date.now() - new Date(order.created_at).getTime() > REFRESH_PENDING_MAX_AGE_MS) return order;
    try {
        const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
        return (await syncFromSession(session)) ?? order;
    } catch (err) {
        console.warn(`[SVI] Falha ao consultar sessão ${order.stripe_session_id}: ${(err as Error).message}`);
        return order;
    }
}

async function handleGetOrder(req: Request, id: string): Promise<Response> {
    const user = await currentUser(req);
    if (!user) return json({ error: LOGIN_REQUIRED }, 401);

    // Cada usuário só enxerga os próprios pedidos
    const order = await getOrder(id);
    if (!order || order.user_id !== user.id) {
        return json({ error: 'Pedido não encontrado.' }, 404);
    }
    return json(await publicOrder(await refreshPending(order)));
}

async function handleMyOrders(req: Request): Promise<Response> {
    const user = await currentUser(req);
    if (!user) return json({ error: LOGIN_REQUIRED }, 401);

    // Pedidos expirados ou que falharam não têm ingressos; não aparecem na lista
    const { data, error } = await db.from('orders').select('*')
        .eq('user_id', user.id)
        .in('status', ['PAID', 'PENDING'])
        .order('created_at', { ascending: false })
        .limit(50);
    if (error) throw error;

    const orders = await Promise.all((data as Order[]).map(refreshPending));
    const visible = orders.filter((o) => o.status === 'PAID' || o.status === 'PENDING');
    return json({ orders: await Promise.all(visible.map(publicOrder)) });
}

async function handleStaffLogin(req: Request): Promise<Response> {
    const ip = clientIp(req);
    // Registra a tentativa e confere o limite numa única operação no banco
    const { data: allowed, error } = await db.rpc('staff_login_attempt', {
        p_ip: ip,
        p_max: LOGIN_MAX_ATTEMPTS,
        p_window_minutes: LOGIN_WINDOW_MINUTES,
    });
    if (error) throw error;
    if (!allowed) {
        return json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, 429);
    }

    const body = await req.json().catch(() => ({}));
    if (!config.staffPassword || !(await safeEqual(String(body?.password ?? ''), config.staffPassword))) {
        return json({ error: 'Chave de acesso incorreta.' }, 401);
    }
    await db.from('staff_login_failures').delete().eq('ip', ip);
    return json({ token: await issueStaffToken() });
}

async function stats() {
    const { data, error } = await db.rpc('ticket_stats');
    if (error) throw error;
    return data as { total: number; used: number };
}

async function handleValidate(req: Request): Promise<Response> {
    const body = await req.json().catch(() => ({}));
    const code = String(body?.code ?? '').trim().toUpperCase();
    if (!TICKET_CODE_PATTERN.test(code)) {
        return json({ result: 'INVALID', message: 'Código em formato inválido.' });
    }

    const { data, error } = await db.rpc('redeem_ticket', { p_code: code });
    if (error) throw error;

    const payload: Record<string, unknown> = { result: data.result, stats: await stats() };
    if (data.ticket) {
        payload.ticket = {
            code: data.ticket.code,
            holderName: data.ticket.holder_name,
            number: data.ticket.number,
            status: data.ticket.status,
            usedAt: toSqliteLikeDate(data.ticket.used_at),
        };
    }
    return json(payload);
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const url = new URL(req.url);
    // Aceita /svi/api/... (URL pública) e /api/... (testes locais)
    const path = url.pathname.replace(/^\/(functions\/v1\/)?svi/, '').replace(/\/$/, '');

    try {
        const needsStripe = ['/api/webhook', '/api/checkout', '/api/my/orders'].includes(path) || path.startsWith('/api/orders/');
        const needsStaff = path.startsWith('/api/staff/') || path === '/api/tickets/validate';
        if ((needsStripe && !config.stripeSecretKey) || (needsStaff && (!config.staffPassword || !config.sessionSecret))) {
            return json({ error: 'Servidor ainda não configurado: defina STRIPE_SECRET_KEY, STAFF_PASSWORD e SESSION_SECRET.' }, 503);
        }

        if (req.method === 'POST' && path === '/api/webhook') return await handleWebhook(req);
        if (req.method === 'GET' && path === '/api/config') {
            return json({
                eventName: config.eventName,
                ticketPrice: config.ticketPriceCents,
                currency: config.currency,
                maxTicketsPerOrder: config.maxTicketsPerOrder,
            });
        }
        if (req.method === 'POST' && path === '/api/checkout') return await handleCheckout(req);

        const orderMatch = path.match(/^\/api\/orders\/([A-Za-z0-9_]+)$/);
        if (req.method === 'GET' && orderMatch) return await handleGetOrder(req, orderMatch[1]);
        if (req.method === 'GET' && path === '/api/my/orders') return await handleMyOrders(req);

        if (req.method === 'POST' && path === '/api/staff/login') return await handleStaffLogin(req);

        if (path === '/api/staff/stats' || path === '/api/tickets/validate') {
            if (!(await verifyStaffToken(staffTokenFrom(req)))) {
                return json({ error: 'Sessão da portaria expirada. Entre novamente.' }, 401);
            }
            if (req.method === 'GET' && path === '/api/staff/stats') return json(await stats());
            if (req.method === 'POST' && path === '/api/tickets/validate') return await handleValidate(req);
        }

        return json({ error: 'Rota não encontrada.' }, 404);
    } catch (err) {
        console.error('[SVI] Erro não tratado:', err);
        return json({ error: 'Erro interno do servidor.' }, 500);
    }
});
