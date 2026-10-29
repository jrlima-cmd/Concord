const crypto = require('node:crypto');

function safeEqual(a, b) {
    const bufA = crypto.createHash('sha256').update(String(a)).digest();
    const bufB = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(bufA, bufB);
}

/** Token assinado (HMAC) e sem estado para a sessão do operador da portaria. */
function createStaffAuth({ secret, sessionHours }) {
    function sign(payload) {
        return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    }

    function issueToken() {
        const payload = Buffer.from(JSON.stringify({
            role: 'staff',
            exp: Date.now() + sessionHours * 60 * 60 * 1000,
        })).toString('base64url');
        return `${payload}.${sign(payload)}`;
    }

    function verifyToken(token) {
        if (typeof token !== 'string' || !token.includes('.')) return false;
        const [payload, signature] = token.split('.');
        if (!safeEqual(signature, sign(payload))) return false;
        try {
            const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
            return data.role === 'staff' && data.exp > Date.now();
        } catch {
            return false;
        }
    }

    function requireStaff(req, res, next) {
        const header = req.get('authorization') || '';
        const token = req.get('x-staff-token') || (header.startsWith('Bearer ') ? header.slice(7) : '');
        if (!verifyToken(token)) {
            return res.status(401).json({ error: 'Sessão da portaria expirada. Entre novamente.' });
        }
        next();
    }

    return { issueToken, verifyToken, requireStaff };
}

/** Limitador simples em memória para tentativas de login. */
function createLoginLimiter({ maxAttempts = 5, windowMs = 5 * 60 * 1000 } = {}) {
    const attempts = new Map();

    return {
        isBlocked(key) {
            const entry = attempts.get(key);
            if (!entry) return false;
            if (Date.now() > entry.resetAt) {
                attempts.delete(key);
                return false;
            }
            return entry.count >= maxAttempts;
        },
        registerFailure(key) {
            const entry = attempts.get(key);
            if (!entry || Date.now() > entry.resetAt) {
                attempts.set(key, { count: 1, resetAt: Date.now() + windowMs });
            } else {
                entry.count++;
            }
        },
        reset(key) {
            attempts.delete(key);
        },
    };
}

module.exports = { createStaffAuth, createLoginLimiter, safeEqual };
