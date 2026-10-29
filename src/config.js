require('dotenv').config();

function intFromEnv(name, fallback) {
    const value = parseInt(process.env[name], 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

const config = {
    port: intFromEnv('PORT', 3000),
    // URL pública da aplicação, usada nos redirecionamentos do Stripe Checkout
    baseUrl: (process.env.BASE_URL || `http://localhost:${intFromEnv('PORT', 3000)}`).replace(/\/$/, ''),

    stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    // Lista separada por vírgula (ex.: "card,pix"). Vazio = métodos ativos no Dashboard da Stripe.
    stripePaymentMethods: (process.env.STRIPE_PAYMENT_METHODS || '')
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean),

    eventName: process.env.EVENT_NAME || 'Ingresso SVI',
    ticketPriceCents: intFromEnv('TICKET_PRICE_CENTS', 5500),
    currency: (process.env.CURRENCY || 'brl').toLowerCase(),
    maxTicketsPerOrder: intFromEnv('MAX_TICKETS_PER_ORDER', 10),

    staffPassword: process.env.STAFF_PASSWORD || '',
    sessionSecret: process.env.SESSION_SECRET || '',
    staffSessionHours: intFromEnv('STAFF_SESSION_HOURS', 12),

    databaseFile: process.env.DATABASE_FILE || 'data/svi.db',
};

function assertConfig() {
    const missing = ['stripeSecretKey', 'staffPassword', 'sessionSecret']
        .filter((key) => !config[key]);
    if (missing.length) {
        const names = {
            stripeSecretKey: 'STRIPE_SECRET_KEY',
            staffPassword: 'STAFF_PASSWORD',
            sessionSecret: 'SESSION_SECRET',
        };
        throw new Error(
            `Variáveis de ambiente ausentes: ${missing.map((k) => names[k]).join(', ')}. ` +
            'Copie .env.example para .env e preencha os valores.'
        );
    }
    if (!config.stripeWebhookSecret) {
        console.warn(
            '[SVI] STRIPE_WEBHOOK_SECRET não definido: o webhook está desativado. ' +
            'Os pedidos serão confirmados apenas quando o comprador voltar do Checkout.'
        );
    }
}

module.exports = { config, assertConfig };
