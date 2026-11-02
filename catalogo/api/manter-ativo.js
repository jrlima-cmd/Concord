// Chamado uma vez por dia pelo cron da Vercel (ver vercel.json).
// Faz uma consulta mínima ao banco do SVI para que o Supabase (plano gratuito)
// não pause o projeto por inatividade.
const SINAL_DE_VIDA = 'https://uztmfkdrylplmscandsd.supabase.co/functions/v1/svi/api/health';

module.exports = async (req, res) => {
    try {
        const resposta = await fetch(SINAL_DE_VIDA, { cache: 'no-store' });
        const corpo = await resposta.json().catch(() => ({}));
        res.status(resposta.ok ? 200 : 502).json({ banco: resposta.ok ? 'ativo' : 'erro', status: resposta.status, ...corpo });
    } catch (err) {
        res.status(502).json({ banco: 'erro', mensagem: err.message });
    }
};
