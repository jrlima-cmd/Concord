const path = require('node:path');
const express = require('express');
const { createStaffAuth, createLoginLimiter, safeEqual } = require('./auth');

const TICKET_CODE_PATTERN = /^TK-[A-Z0-9]{6,16}$/;

function publicOrder(order, tickets) {
    return {
        id: order.id,
        status: order.status,
        holderName: order.holder_name,
        customerEmail: order.customer_email,
        quantity: order.quantity,
        amountTotal: order.amount_total,
        currency: order.currency,
        createdAt: order.created_at,
        paidAt: order.paid_at,
        tickets: tickets.map((t) => ({
            code: t.code,
            number: t.number,
            holderName: t.holder_name,
            status: t.status,
            usedAt: t.used_at,
        })),
    };
}

function createApp({ config, db, stripe }) {
    const app = express();
    const auth = createStaffAuth({ secret: config.sessionSecret, sessionHours: config.staffSessionHours });
    const loginLimiter = createLoginLimiter();

    app.disable('x-powered-by');
    app.set('trust proxy', 1);

    /**
     * Confirma o pedido a partir de uma Checkout Session da Stripe.
     * Chamado pelo webhook e também quando o comprador retorna do Checkout,
     * para que os ingressos apareçam mesmo se o webhook atrasar.
     */
    function syncFromSession(session) {
        const orderId = session.client_reference_id || session.metadata?.order_id;
        const order = orderId ? db.getOrder(orderId) : db.getOrderBySession(session.id);
        if (!order) return null;

        if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
            if (session.amount_total !== order.amount_total || session.currency !== order.currency) {
                console.error(`[SVI] Valor divergente no pedido ${order.id}; ingressos não emitidos.`);
                return order;
            }
            const paymentIntent = typeof session.payment_intent === 'string'
                ? session.payment_intent
                : session.payment_intent?.id;
            const issued = db.fulfillOrder(order.id, {
                customerEmail: session.customer_details?.email || null,
                paymentIntent: paymentIntent || null,
            });
            if (issued) console.log(`[SVI] Pedido ${order.id} pago: ${order.quantity} ingresso(s) emitido(s).`);
        } else if (session.status === 'expired') {
            db.setOrderStatus(order.id, 'EXPIRED');
        }
        return db.getOrder(order.id);
    }

    // ---------- Webhook da Stripe (precisa do corpo bruto para validar a assinatura) ----------
    app.post('/api/webhook', express.raw({ type: 'application/json' }), (req, res) => {
        if (!config.stripeWebhookSecret) {
            return res.status(503).send('Webhook não configurado');
        }

        let event;
        try {
            event = stripe.webhooks.constructEvent(req.body, req.get('stripe-signature'), config.stripeWebhookSecret);
        } catch (err) {
            console.warn(`[SVI] Assinatura de webhook inválida: ${err.message}`);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        try {
            const session = event.data.object;
            switch (event.type) {
                case 'checkout.session.completed':
                case 'checkout.session.async_payment_succeeded':
                case 'checkout.session.expired':
                    syncFromSession(session);
                    break;
                case 'checkout.session.async_payment_failed': {
                    const order = db.getOrder(session.client_reference_id) || db.getOrderBySession(session.id);
                    if (order) db.setOrderStatus(order.id, 'FAILED');
                    break;
                }
                default:
                    break;
            }
        } catch (err) {
            console.error('[SVI] Erro ao processar webhook:', err);
            return res.status(500).send('Erro interno');
        }

        res.json({ received: true });
    });

    app.use(express.json({ limit: '10kb' }));

    // ---------- Configuração pública ----------
    app.get('/api/config', (req, res) => {
        res.json({
            eventName: config.eventName,
            ticketPrice: config.ticketPriceCents,
            currency: config.currency,
            maxTicketsPerOrder: config.maxTicketsPerOrder,
        });
    });

    // ---------- Compra: cria o pedido e a sessão do Stripe Checkout ----------
    app.post('/api/checkout', async (req, res) => {
        const holderName = String(req.body?.holderName || '').trim().replace(/\s+/g, ' ');
        const quantity = Number(req.body?.quantity);

        if (holderName.length < 3 || holderName.length > 80) {
            return res.status(400).json({ error: 'Informe o nome completo do titular (3 a 80 caracteres).' });
        }
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > config.maxTicketsPerOrder) {
            return res.status(400).json({ error: `A quantidade deve ser entre 1 e ${config.maxTicketsPerOrder}.` });
        }

        // O preço vem sempre do servidor; nunca confiamos em valores enviados pelo navegador
        const order = db.createOrder({
            holderName,
            quantity,
            unitAmount: config.ticketPriceCents,
            currency: config.currency,
        });

        try {
            const returnQuery = `order=${order.id}&token=${order.access_token}`;
            const params = {
                mode: 'payment',
                client_reference_id: order.id,
                metadata: { order_id: order.id, holder_name: holderName },
                line_items: [{
                    quantity,
                    price_data: {
                        currency: config.currency,
                        unit_amount: config.ticketPriceCents,
                        product_data: {
                            name: config.eventName,
                            description: `Titular: ${holderName}`,
                        },
                    },
                }],
                payment_intent_data: {
                    description: `${config.eventName} - ${quantity}x - ${holderName}`,
                    metadata: { order_id: order.id },
                },
                locale: 'pt-BR',
                success_url: `${config.baseUrl}/?${returnQuery}&checkout=success`,
                cancel_url: `${config.baseUrl}/?${returnQuery}&checkout=cancel`,
                expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
            };
            if (config.stripePaymentMethods.length) {
                params.payment_method_types = config.stripePaymentMethods;
            }

            const session = await stripe.checkout.sessions.create(params, {
                idempotencyKey: `checkout-${order.id}`,
            });
            db.attachStripeSession(order.id, session.id);

            res.json({ url: session.url, orderId: order.id, accessToken: order.access_token });
        } catch (err) {
            console.error('[SVI] Erro ao criar sessão de Checkout:', err.message);
            db.setOrderStatus(order.id, 'FAILED');
            res.status(502).json({ error: 'Não foi possível iniciar o pagamento. Tente novamente em instantes.' });
        }
    });

    // ---------- Consulta do pedido pelo comprador ----------
    app.get('/api/orders/:id', async (req, res) => {
        const order = db.getOrder(req.params.id);
        if (!order || !safeEqual(req.query.token || '', order.access_token)) {
            return res.status(404).json({ error: 'Pedido não encontrado.' });
        }

        let current = order;
        // Se ainda está pendente, consulta a Stripe diretamente (fallback do webhook)
        if (order.status === 'PENDING' && order.stripe_session_id) {
            try {
                const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
                current = syncFromSession(session) || order;
            } catch (err) {
                console.warn(`[SVI] Falha ao consultar sessão ${order.stripe_session_id}: ${err.message}`);
            }
        }

        res.json(publicOrder(current, db.getTickets(current.id)));
    });

    // ---------- Portaria ----------
    app.post('/api/staff/login', (req, res) => {
        const key = req.ip;
        if (loginLimiter.isBlocked(key)) {
            return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' });
        }
        if (!safeEqual(req.body?.password || '', config.staffPassword)) {
            loginLimiter.registerFailure(key);
            return res.status(401).json({ error: 'Chave de acesso incorreta.' });
        }
        loginLimiter.reset(key);
        res.json({ token: auth.issueToken() });
    });

    app.get('/api/staff/stats', auth.requireStaff, (req, res) => {
        res.json(db.stats());
    });

    app.post('/api/tickets/validate', auth.requireStaff, (req, res) => {
        const code = String(req.body?.code || '').trim().toUpperCase();
        if (!TICKET_CODE_PATTERN.test(code)) {
            return res.json({ result: 'INVALID', message: 'Código em formato inválido.' });
        }

        const { result, ticket } = db.redeemTicket(code);
        const payload = { result, stats: db.stats() };
        if (ticket) {
            payload.ticket = {
                code: ticket.code,
                holderName: ticket.holder_name,
                number: ticket.number,
                status: ticket.status,
                usedAt: ticket.used_at,
            };
        }
        res.json(payload);
    });

    app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

    // ---------- Front-end ----------
    // public/config.js aponta para a API no Supabase; aqui a API é este mesmo servidor
    app.get('/config.js', (req, res) => {
        res.type('application/javascript').send("window.SVI_API_BASE = '';\n");
    });
    app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

    app.use((err, req, res, next) => {
        console.error('[SVI] Erro não tratado:', err);
        if (res.headersSent) return next(err);
        res.status(err.status || 500).json({ error: 'Erro interno do servidor.' });
    });

    return app;
}

module.exports = { createApp };
