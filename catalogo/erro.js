'use strict';

// Comportamento das páginas de erro (sem script inline, por causa da CSP)
document.addEventListener('DOMContentLoaded', () => {
    // A Vercel troca os marcadores ::vercel:...:: quando serve a 500 num erro real.
    // Aberta direto, a linha ficaria com o marcador cru, então escondemos.
    document.querySelectorAll('[data-ref]').forEach((linha) => {
        if (linha.textContent.includes('::vercel:')) linha.hidden = true;
    });

    // "Tentar de novo" volta para a página de origem (?de=/caminho), só dentro do próprio site
    document.querySelectorAll('[data-tentar]').forEach((botao) => {
        botao.addEventListener('click', () => {
            const de = new URLSearchParams(window.location.search).get('de') || '/';
            // O navegador é quem interpreta o endereço; só seguimos se continuar no mesmo site
            let destino = '/';
            try {
                const url = new URL(de, window.location.origin);
                if (url.origin === window.location.origin) destino = url.pathname + url.search + url.hash;
            } catch {
                // Endereço inválido: volta para o início
            }
            window.location.href = destino;
        });
    });

    // "Voltar" usa o histórico; se a página foi aberta direto, vai para o início
    document.querySelectorAll('[data-voltar]').forEach((botao) => {
        botao.addEventListener('click', () => {
            if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) {
                window.history.back();
            } else {
                window.location.href = '/';
            }
        });
    });
});
