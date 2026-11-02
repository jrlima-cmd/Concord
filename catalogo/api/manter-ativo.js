'use strict';

// Chamado 1x por dia pelo agendamento da Vercel (vercel.json → crons) para manter o
// banco do Supabase ativo: o plano gratuito pausa projetos sem uso por 7 dias.
// Só o agendamento pode chamar: a Vercel envia "Authorization: Bearer <CRON_SECRET>".
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SINAL_DE_VIDA = 'https://uztmfkdrylplmscandsd.supabase.co/functions/v1/svi/api/health';

function autorizado(req) {
    const segredo = process.env.CRON_SECRET;
    if (!segredo) return false; // sem segredo configurado, ninguém entra
    const esperado = Buffer.from(`Bearer ${segredo}`);
    const recebido = Buffer.from(String(req.headers.authorization || ''));
    return recebido.length === esperado.length && crypto.timingSafeEqual(recebido, esperado);
}

// Quem abre no navegador vê a página de erro da Ghost tech; o agendamento recebe JSON
function responder(req, res, status, dados, pagina) {
    if (pagina && String(req.headers.accept || '').includes('text/html')) {
        try {
            const html = fs.readFileSync(path.join(process.cwd(), pagina), 'utf8');
            res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(html);
            return;
        } catch {
            // Sem o arquivo da página, cai no JSON abaixo
        }
    }
    res.status(status).json(dados);
}

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!autorizado(req)) {
        responder(req, res, 401, { erro: 'não autorizado' }, '401.html');
        return;
    }
    try {
        const resposta = await fetch(SINAL_DE_VIDA, { cache: 'no-store' });
        const corpo = await resposta.json().catch(() => ({}));
        if (resposta.ok) {
            res.status(200).json({ banco: 'ativo', status: resposta.status, ...corpo });
        } else {
            responder(req, res, 503, { banco: 'erro', status: resposta.status, ...corpo }, '503.html');
        }
    } catch (err) {
        responder(req, res, 503, { banco: 'erro', mensagem: err.message }, '503.html');
    }
};
