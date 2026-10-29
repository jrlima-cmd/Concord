const Stripe = require('stripe');
const { config, assertConfig } = require('./config');
const { openDatabase } = require('./db');
const { createApp } = require('./app');

try {
    assertConfig();
} catch (err) {
    console.error(`[SVI] ${err.message}`);
    process.exit(1);
}

const db = openDatabase(config.databaseFile);
const stripe = new Stripe(config.stripeSecretKey);
const app = createApp({ config, db, stripe });

const server = app.listen(config.port, () => {
    const mode = config.stripeSecretKey.startsWith('sk_live_') ? 'PRODUÇÃO' : 'TESTE';
    console.log(`[SVI] Servidor em ${config.baseUrl} (porta ${config.port}) - Stripe em modo ${mode}`);
});

function shutdown() {
    server.close(() => {
        db.close();
        process.exit(0);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
