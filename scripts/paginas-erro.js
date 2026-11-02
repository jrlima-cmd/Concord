'use strict';

// Gera as páginas de erro do SVI (public/) e do catálogo Ghost tech (catalogo/).
// Para mudar um texto: edite ERROS abaixo e rode `npm run paginas-erro`.
//
// Como cada página é usada:
// - 404.html: a Vercel mostra sozinha quando o endereço não existe.
// - 500.html: a Vercel usa como página de erro do servidor (onde o plano permite);
//   os marcadores ::vercel:...:: viram o código do erro e o ID da requisição.
// - 401/403/429/503: abertas pelo próprio sistema quando acontece aquela situação
//   (ex.: o SVI vai para /503 se o servidor não responder ao abrir).
// Os links de CSS e JS começam com "/" porque a 404 aparece em qualquer endereço.

const fs = require('node:fs');
const path = require('node:path');

const ERROS = {
    401: {
        titulo: 'Acesso restrito',
        texto: 'Esta área só abre para quem está conectado. Entre na sua conta e tente de novo.',
        dica: 'Se você já estava conectado, sua sessão pode ter expirado.',
        catalogo: {
            texto: 'Esta área é de uso interno da Ghost tech.',
            dica: 'Se você é assinante, use "Gerenciar minha assinatura" ou fale com a gente pelo e-mail abaixo.',
        },
    },
    403: {
        titulo: 'Sem permissão',
        texto: 'Sua conta está conectada, mas não tem acesso a esta página ou a este pedido.',
        dica: 'Se acha que é um engano, fale com o suporte informando o endereço que tentou abrir.',
    },
    404: {
        titulo: 'Página não encontrada',
        texto: 'O endereço pode ter sido digitado errado ou a página mudou de lugar.',
        dica: 'Confira o link ou volte para o início.',
    },
    429: {
        titulo: 'Muitas tentativas',
        texto: 'Por segurança, pausamos as tentativas por alguns minutos.',
        dica: 'Aguarde 5 minutos e tente de novo. Nada foi cobrado nem alterado.',
    },
    500: {
        titulo: 'Algo deu errado do nosso lado',
        texto: 'Foi um erro no servidor, não com você. Já registramos o problema.',
        dica: 'Tente de novo em instantes. Se continuar, fale com o suporte.',
        referencia: true,
    },
    503: {
        titulo: 'Serviço indisponível',
        texto: 'Não conseguimos falar com o servidor agora. Pode ser a sua internet ou uma manutenção rápida.',
        dica: 'Confira a conexão e toque em "Tentar de novo". Seus ingressos e pagamentos continuam guardados.',
        tentar: true,
        catalogo: {
            dica: 'Confira a conexão e toque em "Tentar de novo". Sua assinatura não é afetada.',
        },
    },
};

const CONTATO = 'joaorafaeloliveiradelima@gmail.com';

function escapar(texto) {
    return String(texto).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Ação principal: "Tentar de novo" na 503, "Voltar" nas demais
function botoes(codigo, erro, classes) {
    const principal = erro.tentar
        ? `<button class="${classes.principal}" type="button" data-tentar>Tentar de novo</button>`
        : `<a class="${classes.principal}" href="/">${codigo === 401 ? 'Entrar' : 'Ir para o início'}</a>`;
    return `${principal}
                <button class="${classes.secundario}" type="button" data-voltar>Voltar</button>`;
}

function referencia(erro, classe) {
    if (!erro.referencia) return '';
    return `
            <p class="${classe}" data-ref>Código do erro: <code>::vercel:ERROR_CODE::</code> · ID: <code>::vercel:REQUEST_ID::</code></p>`;
}

// ---------- SVI: tema escuro índigo, igual ao app ----------
function paginaSvi(codigo, erro) {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#0b0f17">
    <meta name="robots" content="noindex">
    <title>${escapar(erro.titulo)} - SVI</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/erro.css">
    <script src="/erro.js" defer></script>
</head>
<body>
    <main class="erro">
        <a class="marca" href="/">🎫 SVI</a>
        <section class="cartao" aria-labelledby="titulo">
            <p class="codigo" aria-hidden="true">${codigo}</p>
            <p class="rotulo">Erro ${codigo}</p>
            <h1 id="titulo">${escapar(erro.titulo)}</h1>
            <p class="texto">${escapar(erro.texto)}</p>
            <p class="dica">${escapar(erro.dica)}</p>${referencia(erro, 'ref')}
            <div class="acoes">
                ${botoes(codigo, erro, { principal: 'btn btn-primario', secundario: 'btn btn-secundario' })}
            </div>
        </section>
        <p class="rodape">
            <a href="/suporte">Suporte</a> · <a href="/privacidade">Privacidade</a> · <a href="/termos">Termos de uso</a>
        </p>
    </main>
</body>
</html>
`;
}

// ---------- Catálogo: papel claro/escuro com o verde da Ghost tech ----------
const FANTASMA = '<svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><path d="M16 3C9.9 3 5 7.9 5 14v14.2c0 .8.9 1.2 1.5.7l2.7-2.2 2.6 2.2c.4.3.9.3 1.3 0L16 26.7l2.9 2.2c.4.3.9.3 1.3 0l2.6-2.2 2.7 2.2c.6.5 1.5.1 1.5-.7V14C27 7.9 22.1 3 16 3z"/><circle cx="12" cy="14" r="2.2" class="eye"/><circle cx="20" cy="14" r="2.2" class="eye"/></svg>';

function paginaCatalogo(codigo, erro) {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta name="robots" content="noindex">
    <title>${escapar(erro.titulo)} | Ghost tech</title>
    <meta name="theme-color" content="#f2f4f3" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#0b0f0e" media="(prefers-color-scheme: dark)">
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/estilo.css">
    <link rel="stylesheet" href="/erro.css">
    <script src="/erro.js" defer></script>
</head>
<body class="pagina-erro">
    <header class="topbar">
        <div class="wrap">
            <a class="brand" href="/" aria-label="Ghost tech, início">
                ${FANTASMA}
                Ghost tech
            </a>
        </div>
    </header>

    <main class="erro">
        <div class="wrap">
            <span class="eyebrow"><span class="dot"></span>Erro ${codigo}</span>
            <p class="erro-codigo" aria-hidden="true">${codigo}</p>
            <h1>${escapar(erro.titulo)}</h1>
            <p class="lead">${escapar(erro.texto)}</p>
            <p class="erro-dica">${escapar(erro.dica)}</p>${referencia(erro, 'erro-ref')}
            <div class="hero-actions">
                ${botoes(codigo, erro, { principal: 'btn btn-primary', secundario: 'btn btn-ghost' }).replace('Ir para o início', 'Ver os sistemas').replace('>Entrar<', '>Ver os sistemas<')}
            </div>
            <p class="note-line">Precisa de ajuda? <span class="mail">${CONTATO}</span></p>
        </div>
    </main>

    <footer class="footer">
        <div class="wrap">
            <span>© 2026 Ghost tech</span>
            <span><a href="/privacidade">Privacidade</a> · <a href="/termos">Termos de uso</a></span>
        </div>
    </footer>
</body>
</html>
`;
}

const raiz = path.join(__dirname, '..');
for (const [codigo, erro] of Object.entries(ERROS)) {
    fs.writeFileSync(path.join(raiz, 'public', `${codigo}.html`), paginaSvi(Number(codigo), erro));
    // Textos próprios do catálogo, quando o do SVI não serve (ex.: o catálogo não tem login)
    fs.writeFileSync(path.join(raiz, 'catalogo', `${codigo}.html`), paginaCatalogo(Number(codigo), { ...erro, ...erro.catalogo }));
}
console.log(`Páginas geradas: ${Object.keys(ERROS).join(', ')} (public/ e catalogo/)`);
