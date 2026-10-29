'use strict';

// Contato exibido nos botões "Falar com a Ghost tech"
const CONTATO_EMAIL = 'joaorafaeloliveiradelima@gmail.com';
// Portal da Stripe onde o assinante vê faturas, troca o cartão ou cancela
const PORTAL_ASSINANTE = 'https://billing.stripe.com/p/login/test_5kQ4gBedpcOX08W8C23VC00';

const ICONES = {
    ingresso: '<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M14 6v12" stroke-dasharray="2 2"/>',
    agenda: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    loja: '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/>',
    grafico: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    sistema: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3"/>',
};

function icone(nome) {
    const caminho = ICONES[nome] || ICONES.sistema;
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${caminho}</svg>`;
}

function el(tag, attrs = {}, ...filhos) {
    const node = document.createElement(tag);
    for (const [chave, valor] of Object.entries(attrs)) {
        if (valor === null || valor === undefined || valor === false) continue;
        if (chave === 'class') node.className = valor;
        else if (chave === 'html') node.innerHTML = valor; // usado apenas com os ícones fixos acima
        else if (chave.startsWith('on')) node.addEventListener(chave.slice(2), valor);
        else node.setAttribute(chave, valor);
    }
    for (const filho of filhos.flat()) {
        if (filho === null || filho === undefined || filho === false) continue;
        node.append(filho instanceof Node ? filho : document.createTextNode(String(filho)));
    }
    return node;
}

function formatarPreco(centavos) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(centavos / 100);
}

function etiquetaStatus(status) {
    const disponivel = status === 'disponivel';
    return el('span', { class: `status ${disponivel ? 'disponivel' : 'em-breve'}` },
        el('span', { class: 'dot' }), disponivel ? 'Disponível' : 'Em breve');
}

function blocoPreco(produto) {
    const preco = produto.preco || {};
    if (!preco.mensalidade) {
        return el('div', { class: 'price' }, el('strong', {}, 'Sob consulta'));
    }
    return el('div', { class: 'price' },
        el('strong', {}, formatarPreco(preco.mensalidade)),
        el('span', {}, '/mês'),
        preco.taxa ? el('span', {}, preco.taxa) : null
    );
}

function linkContato(produto, rotulo = 'Quero assinar', classe = 'btn btn-accent') {
    const assunto = encodeURIComponent(`Quero assinar o ${produto.nome}`);
    const corpo = encodeURIComponent(`Olá! Tenho interesse no ${produto.nome} (${produto.titulo}).\n\nMeu nome:\nMinha empresa:\nTelefone:`);
    return el('a', { class: classe, href: `mailto:${CONTATO_EMAIL}?subject=${assunto}&body=${corpo}` }, rotulo);
}

// Assinatura pelo link de pagamento da Stripe; sem link, cai no contato por e-mail
function botaoAssinar(produto, classe = 'btn btn-accent') {
    if (produto.status === 'disponivel' && produto.links?.assinar) {
        return el('a', { class: classe, href: produto.links.assinar }, 'Assinar agora');
    }
    return produto.status === 'disponivel'
        ? linkContato(produto, 'Quero assinar', classe)
        : linkContato(produto, 'Avise-me quando lançar', classe);
}

async function carregarProdutos() {
    const resposta = await fetch('produtos.json', { cache: 'no-cache' });
    if (!resposta.ok) throw new Error('Falha ao carregar o catálogo');
    const produtos = await resposta.json();
    // Disponíveis primeiro, depois "em breve", mantendo a ordem do arquivo dentro de cada grupo
    return produtos
        .map((p, i) => ({ ...p, _ordem: i }))
        .sort((a, b) => (a.status === 'disponivel' ? 0 : 1) - (b.status === 'disponivel' ? 0 : 1) || a._ordem - b._ordem);
}

// ==================== Página inicial ====================
function cartao(produto) {
    const url = `sistema.html?id=${encodeURIComponent(produto.id)}`;
    return el('article', { class: 'card' },
        el('div', { class: 'card-top' },
            el('div', { class: 'card-icon', html: icone(produto.icone) }),
            etiquetaStatus(produto.status)
        ),
        el('div', {},
            el('div', { class: 'card-cat' }, produto.categoria),
            el('h3', {}, produto.nome, el('small', {}, produto.titulo))
        ),
        el('p', {}, produto.resumo),
        blocoPreco(produto),
        el('div', { class: 'card-actions' },
            produto.status === 'disponivel' && produto.links?.assinar ? botaoAssinar(produto) : null,
            el('a', { class: 'btn btn-primary', href: url }, 'Ver detalhes'),
            produto.links?.demonstracao
                ? el('a', { class: 'btn btn-ghost', href: produto.links.demonstracao, target: '_blank', rel: 'noopener' }, 'Demonstração')
                : null
        )
    );
}

async function iniciarCatalogo() {
    const grade = document.getElementById('grade');
    const filtros = document.getElementById('filtros');
    const contador = document.getElementById('contador');

    let produtos;
    try {
        produtos = await carregarProdutos();
    } catch {
        grade.replaceChildren(el('div', { class: 'empty' }, 'Não foi possível carregar os sistemas. Atualize a página.'));
        return;
    }

    const categorias = ['Todos', ...new Set(produtos.map((p) => p.categoria))];
    let ativa = 'Todos';

    function desenhar() {
        const lista = ativa === 'Todos' ? produtos : produtos.filter((p) => p.categoria === ativa);
        grade.replaceChildren(...(lista.length ? lista.map(cartao) : [el('div', { class: 'empty' }, 'Nenhum sistema nesta categoria ainda.')]));
        const disponiveis = produtos.filter((p) => p.status === 'disponivel').length;
        contador.textContent = `${disponiveis} ${disponiveis === 1 ? 'sistema disponível' : 'sistemas disponíveis'}`;
        filtros.querySelectorAll('.chip').forEach((chip) => chip.setAttribute('aria-pressed', String(chip.dataset.cat === ativa)));
    }

    // Só mostra filtros quando há mais de uma categoria
    if (categorias.length > 2) {
        filtros.replaceChildren(...categorias.map((cat) =>
            el('button', { class: 'chip', type: 'button', 'data-cat': cat, 'aria-pressed': 'false', onclick: () => { ativa = cat; desenhar(); } }, cat)
        ));
    }
    desenhar();
}

// ==================== Página do sistema ====================
async function iniciarDetalhe() {
    const alvo = document.getElementById('detalhe');
    const id = new URLSearchParams(window.location.search).get('id');

    let produto;
    try {
        produto = (await carregarProdutos()).find((p) => p.id === id);
    } catch {
        produto = null;
    }

    if (!produto) {
        alvo.replaceChildren(
            el('a', { class: 'back', href: './' }, '← Todos os sistemas'),
            el('h1', {}, 'Sistema não encontrado'),
            el('p', { class: 'lead' }, 'Este endereço não corresponde a nenhum sistema do catálogo.')
        );
        return;
    }

    document.title = `${produto.nome}: ${produto.titulo} | Ghost tech`;
    const preco = produto.preco || {};

    alvo.replaceChildren(
        el('a', { class: 'back', href: './' }, '← Todos os sistemas'),
        el('div', { class: 'detail-grid' },
            el('div', {},
                el('div', { class: 'card-top detail-meta' },
                    el('div', { class: 'card-icon', html: icone(produto.icone) }),
                    etiquetaStatus(produto.status),
                    el('span', { class: 'card-cat' }, produto.categoria)
                ),
                el('h1', {}, produto.nome),
                el('p', { class: 'lead' }, produto.titulo),
                el('h2', {}, 'O que faz'),
                el('p', { class: 'body' }, produto.descricao || produto.resumo),
                produto.recursos?.length ? el('h2', {}, 'Recursos') : null,
                produto.recursos?.length ? el('ul', { class: 'features' }, produto.recursos.map((r) => el('li', {}, r))) : null,
                produto.publico ? el('h2', {}, 'Para quem é') : null,
                produto.publico ? el('p', { class: 'body' }, produto.publico) : null
            ),
            el('aside', { class: 'plan' },
                el('div', { class: 'card-cat' }, 'Plano'),
                blocoPreco(produto),
                preco.observacao ? el('p', { class: 'note' }, preco.observacao) : null,
                botaoAssinar(produto),
                produto.status === 'disponivel' && produto.links?.assinar
                    ? el('p', { class: 'note' }, 'Pagamento seguro pela Stripe. Cartão de crédito, renovação mensal, cancele quando quiser. Ao assinar você concorda com os ', el('a', { href: 'termos' }, 'Termos de uso'), ' e a ', el('a', { href: 'privacidade' }, 'Política de Privacidade'), '.')
                    : null,
                produto.links?.demonstracao
                    ? el('a', { class: 'btn btn-ghost', href: produto.links.demonstracao, target: '_blank', rel: 'noopener' }, 'Abrir demonstração')
                    : null,
                el('p', { class: 'note' }, 'Dúvidas antes de assinar? Escreva para ', el('span', { class: 'mail' }, CONTATO_EMAIL))
            )
        )
    );
}

// ==================== Página de agradecimento ====================
async function iniciarObrigado() {
    const id = new URLSearchParams(window.location.search).get('sistema');
    let produto = null;
    try {
        produto = (await carregarProdutos()).find((p) => p.id === id) || null;
    } catch {
        // Sem o catálogo, a página mostra a mensagem genérica
    }
    if (produto) {
        document.getElementById('obrigado-sistema').textContent = `${produto.nome}: ${produto.titulo}`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('ano').textContent = new Date().getFullYear();
    document.querySelectorAll('[data-portal]').forEach((a) => { a.href = PORTAL_ASSINANTE; });
    if (document.getElementById('grade')) iniciarCatalogo();
    if (document.getElementById('detalhe')) iniciarDetalhe();
    if (document.getElementById('obrigado-sistema')) iniciarObrigado();
});
