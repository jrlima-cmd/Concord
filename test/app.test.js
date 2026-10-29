const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Stripe = require('stripe');
const { openDatabase } = require('../src/db');
const { createApp } = require('../src/app');

const WEBHOOK_SECRET = 'whsec_test_secret';
const config = {
    baseUrl: 'http://localhost',
    stripeWebhookSecret: WEBHOOK_SECRET,
    stripePaymentMethods: [],
    eventName: 'Show Teste',
    ticketPriceCents: 5500,
    currency: 'brl',
    maxTicketsPerOrder: 10,
    staffPassword: 'senha-portaria',
    sessionSecret: 'segredo-de-teste',
    staffSessionHours: 1,
};

// Stripe real para assinar/verificar webhooks; chamadas de rede substituídas por stubs
const stripe = new Stripe('sk_test_dummy');
const sessions = new Map();
stripe.checkout.sessions.create = async (params) => {
    const session = {
        id: `cs_test_${sessions.size + 1}`,
        url: `https://checkout.stripe.com/c/pay/cs_test_${sessions.size + 1}`,
        client_reference_id: params.client_reference_id,
        metadata: params.metadata,
        amount_total: params.line_items[0].price_data.unit_amount * params.line_items[0].quantity,
        currency: params.line_items[0].price_data.currency,
        payment_status: 'unpaid',
        status: 'open',
        payment_intent: null,
        customer_details: null,
    };
    sessions.set(session.id, session);
    return session;
};
stripe.checkout.sessions.retrieve = async (id) => sessions.get(id);

let server;
let baseUrl;
const db = openDatabase(':memory:');

before(async () => {
    const app = createApp({ config, db, stripe });
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
    server.close();
    db.close();
});

async function call(path, { method = 'GET', body, token, raw, headers = {} } = {}) {
    const res = await fetch(baseUrl + path, {
        method,
        headers: {
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...headers,
        },
        body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
    return { status: res.status, data: await res.json().catch(() => null) };
}

function sendWebhook(type, object) {
    const payload = JSON.stringify({ id: 'evt_test', type, data: { object } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    return call('/api/webhook', {
        method: 'POST',
        raw: payload,
        headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature },
    });
}

async function staffToken() {
    const { data } = await call('/api/staff/login', { method: 'POST', body: { password: 'senha-portaria' } });
    return data.token;
}

test('rejeita dados de compra inválidos', async () => {
    assert.equal((await call('/api/checkout', { method: 'POST', body: { holderName: 'A', quantity: 1 } })).status, 400);
    assert.equal((await call('/api/checkout', { method: 'POST', body: { holderName: 'Ana Silva', quantity: 11 } })).status, 400);
    assert.equal((await call('/api/checkout', { method: 'POST', body: { holderName: 'Ana Silva', quantity: 1.5 } })).status, 400);
});

test('fluxo completo: checkout, webhook, emissão e validação na portaria', async () => {
    const checkout = await call('/api/checkout', { method: 'POST', body: { holderName: 'Ana  Silva', quantity: 3 } });
    assert.equal(checkout.status, 200);
    assert.match(checkout.data.url, /^https:\/\/checkout\.stripe\.com/);

    const { orderId, accessToken } = checkout.data;
    const orderPath = `/api/orders/${orderId}?token=${accessToken}`;

    assert.equal((await call(`/api/orders/${orderId}?token=errado`)).status, 404);
    let order = (await call(orderPath)).data;
    assert.equal(order.status, 'PENDING');
    assert.equal(order.amountTotal, 16500);
    assert.equal(order.holderName, 'Ana Silva');

    // Assinatura inválida é recusada
    const bad = await call('/api/webhook', { method: 'POST', raw: '{}', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 't=1,v1=abc' } });
    assert.equal(bad.status, 400);

    const session = [...sessions.values()].find((s) => s.client_reference_id === orderId);
    Object.assign(session, { payment_status: 'paid', status: 'complete', payment_intent: 'pi_123', customer_details: { email: 'ana@example.com' } });
    assert.equal((await sendWebhook('checkout.session.completed', session)).status, 200);
    // Webhook duplicado não emite ingressos em dobro
    assert.equal((await sendWebhook('checkout.session.completed', session)).status, 200);

    order = (await call(orderPath)).data;
    assert.equal(order.status, 'PAID');
    assert.equal(order.customerEmail, 'ana@example.com');
    assert.equal(order.tickets.length, 3);
    assert.ok(order.tickets.every((t) => /^TK-[A-Z0-9]{10}$/.test(t.code) && t.status === 'VALID'));

    // Portaria
    assert.equal((await call('/api/tickets/validate', { method: 'POST', body: { code: order.tickets[0].code } })).status, 401);
    assert.equal((await call('/api/staff/login', { method: 'POST', body: { password: 'errada' } })).status, 401);
    const token = await staffToken();

    const first = await call('/api/tickets/validate', { method: 'POST', body: { code: order.tickets[0].code.toLowerCase() }, token });
    assert.equal(first.data.result, 'OK');
    assert.equal(first.data.ticket.holderName, 'Ana Silva');
    assert.deepEqual(first.data.stats, { total: 3, used: 1 });

    const second = await call('/api/tickets/validate', { method: 'POST', body: { code: order.tickets[0].code }, token });
    assert.equal(second.data.result, 'ALREADY_USED');

    assert.equal((await call('/api/tickets/validate', { method: 'POST', body: { code: 'TK-NAOEXISTE' }, token })).data.result, 'NOT_FOUND');
    assert.equal((await call('/api/tickets/validate', { method: 'POST', body: { code: '<script>' }, token })).data.result, 'INVALID');

    order = (await call(orderPath)).data;
    assert.equal(order.tickets[0].status, 'USED');
});

test('confirma o pedido pelo retorno do checkout mesmo sem webhook', async () => {
    const { data } = await call('/api/checkout', { method: 'POST', body: { holderName: 'Bruno Costa', quantity: 2 } });
    const session = [...sessions.values()].find((s) => s.client_reference_id === data.orderId);
    session.payment_status = 'paid';

    const order = (await call(`/api/orders/${data.orderId}?token=${data.accessToken}`)).data;
    assert.equal(order.status, 'PAID');
    assert.equal(order.tickets.length, 2);
});

test('não emite ingressos se o valor pago divergir do pedido', async () => {
    const { data } = await call('/api/checkout', { method: 'POST', body: { holderName: 'Carla Dias', quantity: 1 } });
    const session = [...sessions.values()].find((s) => s.client_reference_id === data.orderId);
    Object.assign(session, { payment_status: 'paid', amount_total: 100 });
    await sendWebhook('checkout.session.completed', session);

    const order = (await call(`/api/orders/${data.orderId}?token=${data.accessToken}`)).data;
    assert.equal(order.status, 'PENDING');
    assert.equal(order.tickets.length, 0);
});

test('marca pedido expirado', async () => {
    const { data } = await call('/api/checkout', { method: 'POST', body: { holderName: 'Davi Souza', quantity: 1 } });
    const session = [...sessions.values()].find((s) => s.client_reference_id === data.orderId);
    session.status = 'expired';
    await sendWebhook('checkout.session.expired', session);

    const order = (await call(`/api/orders/${data.orderId}?token=${data.accessToken}`)).data;
    assert.equal(order.status, 'EXPIRED');
});

test('bloqueia força bruta no login da portaria', async () => {
    for (let i = 0; i < 5; i++) {
        await call('/api/staff/login', { method: 'POST', body: { password: 'x' } });
    }
    assert.equal((await call('/api/staff/login', { method: 'POST', body: { password: 'senha-portaria' } })).status, 429);
});
