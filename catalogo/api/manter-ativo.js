'use strict';

// Chamado 1x por dia pelo agendamento da Vercel (vercel.json → crons) para manter o
// banco do Supabase ativo: o plano gratuito pausa projetos sem uso por 7 dias.
// Só o agendamento pode chamar: a Vercel envia "Authorization: Bearer <CRON_SECRET>".
const crypto = require('crypto');

const SINAL_DE_VIDA = 'https://uztmfkdrylplmscandsd.supabase.co/functions/v1/svi/api/health';

function autorizado(req) {
    const segredo = process.env.CRON_SECRET;
    if (!segredo) return false; // sem segredo configurado, ninguém entra
    const esperado = Buffer.from(`Bearer ${segredo}`);
    const recebido = Buffer.from(String(req.headers.authorization || ''));
    return recebido.length === esperado.length && crypto.timingSafeEqual(recebido, esperado);
}

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!autorizado(req)) {
        res.status(401).json({ erro: 'não autorizado' });
        return;
    }
    try {
        const resposta = await fetch(SINAL_DE_VIDA, { cache: 'no-store' });
        const corpo = await resposta.json().catch(() => ({}));
        res.status(resposta.ok ? 200 : 502).json({ banco: resposta.ok ? 'ativo' : 'erro', status: resposta.status, ...corpo });
    } catch (err) {
        res.status(502).json({ banco: 'erro', mensagem: err.message });
    }
};
