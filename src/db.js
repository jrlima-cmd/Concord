const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

// Sem caracteres ambíguos (0/O, 1/I/L) para facilitar a digitação manual na portaria
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 10;

function generateTicketCode() {
    const bytes = crypto.randomBytes(CODE_LENGTH);
    let code = '';
    for (const byte of bytes) {
        code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
    }
    return `TK-${code}`;
}

function openDatabase(file) {
    if (file !== ':memory:') {
        fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    }
    const db = new DatabaseSync(file);
    db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS orders (
            id                TEXT PRIMARY KEY,
            access_token      TEXT NOT NULL,
            stripe_session_id TEXT UNIQUE,
            holder_name       TEXT NOT NULL,
            customer_email    TEXT,
            quantity          INTEGER NOT NULL,
            unit_amount       INTEGER NOT NULL,
            amount_total      INTEGER NOT NULL,
            currency          TEXT NOT NULL,
            status            TEXT NOT NULL DEFAULT 'PENDING',
            payment_intent    TEXT,
            created_at        TEXT NOT NULL DEFAULT (datetime('now')),
            paid_at           TEXT
        );

        CREATE TABLE IF NOT EXISTS tickets (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            code        TEXT NOT NULL UNIQUE,
            order_id    TEXT NOT NULL REFERENCES orders(id),
            number      INTEGER NOT NULL,
            holder_name TEXT NOT NULL,
            status      TEXT NOT NULL DEFAULT 'VALID',
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            used_at     TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_tickets_order ON tickets(order_id);
    `);

    const stmt = {
        insertOrder: db.prepare(`
            INSERT INTO orders (id, access_token, holder_name, quantity, unit_amount, amount_total, currency)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `),
        attachSession: db.prepare('UPDATE orders SET stripe_session_id = ? WHERE id = ?'),
        getOrder: db.prepare('SELECT * FROM orders WHERE id = ?'),
        getOrderBySession: db.prepare('SELECT * FROM orders WHERE stripe_session_id = ?'),
        markPaid: db.prepare(`
            UPDATE orders
            SET status = 'PAID', paid_at = datetime('now'),
                customer_email = COALESCE(?, customer_email),
                payment_intent = COALESCE(?, payment_intent)
            WHERE id = ? AND status != 'PAID'
        `),
        setStatus: db.prepare(`UPDATE orders SET status = ? WHERE id = ? AND status = 'PENDING'`),
        insertTicket: db.prepare(`
            INSERT INTO tickets (code, order_id, number, holder_name) VALUES (?, ?, ?, ?)
        `),
        ticketsByOrder: db.prepare('SELECT * FROM tickets WHERE order_id = ? ORDER BY number'),
        getTicket: db.prepare('SELECT * FROM tickets WHERE code = ?'),
        useTicket: db.prepare(`
            UPDATE tickets SET status = 'USED', used_at = datetime('now')
            WHERE code = ? AND status = 'VALID'
        `),
        stats: db.prepare(`
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'USED' THEN 1 ELSE 0 END) AS used
            FROM tickets
        `),
    };

    function transaction(fn) {
        db.exec('BEGIN IMMEDIATE');
        try {
            const result = fn();
            db.exec('COMMIT');
            return result;
        } catch (err) {
            db.exec('ROLLBACK');
            throw err;
        }
    }

    return {
        createOrder({ holderName, quantity, unitAmount, currency }) {
            const id = `ord_${crypto.randomBytes(12).toString('hex')}`;
            const accessToken = crypto.randomBytes(24).toString('base64url');
            stmt.insertOrder.run(id, accessToken, holderName, quantity, unitAmount, unitAmount * quantity, currency);
            return stmt.getOrder.get(id);
        },

        attachStripeSession(orderId, sessionId) {
            stmt.attachSession.run(sessionId, orderId);
        },

        getOrder(id) {
            return stmt.getOrder.get(id);
        },

        getOrderBySession(sessionId) {
            return stmt.getOrderBySession.get(sessionId);
        },

        getTickets(orderId) {
            return stmt.ticketsByOrder.all(orderId);
        },

        /**
         * Marca o pedido como pago e emite os ingressos. Idempotente: o webhook e o
         * retorno do Checkout podem chamar isto mais de uma vez para o mesmo pedido.
         */
        fulfillOrder(orderId, { customerEmail = null, paymentIntent = null } = {}) {
            return transaction(() => {
                const result = stmt.markPaid.run(customerEmail, paymentIntent, orderId);
                if (result.changes === 0) return false;

                const order = stmt.getOrder.get(orderId);
                for (let n = 1; n <= order.quantity; n++) {
                    // Colisão é praticamente impossível (31^10), mas tentamos de novo por segurança
                    for (let attempt = 0; ; attempt++) {
                        try {
                            stmt.insertTicket.run(generateTicketCode(), orderId, n, order.holder_name);
                            break;
                        } catch (err) {
                            if (attempt >= 5 || !String(err.message).includes('UNIQUE')) throw err;
                        }
                    }
                }
                return true;
            });
        },

        setOrderStatus(orderId, status) {
            stmt.setStatus.run(status, orderId);
        },

        /**
         * Valida um ingresso na portaria. A atualização é atômica, então duas leituras
         * simultâneas do mesmo QR Code nunca liberam a entrada duas vezes.
         */
        redeemTicket(code) {
            const ticket = stmt.getTicket.get(code);
            if (!ticket) return { result: 'NOT_FOUND' };
            const update = stmt.useTicket.run(code);
            if (update.changes === 0) return { result: 'ALREADY_USED', ticket };
            return { result: 'OK', ticket: stmt.getTicket.get(code) };
        },

        stats() {
            const row = stmt.stats.get();
            return { total: row.total || 0, used: row.used || 0 };
        },

        close() {
            db.close();
        },
    };
}

module.exports = { openDatabase, generateTicketCode };
