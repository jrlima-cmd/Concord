// Gera o roteiro da narração, a legenda e as hashtags do vídeo.
// O roteiro é dividido em frases curtas: cada frase vira um trecho de áudio
// e uma legenda na tela, sincronizados.

const sorteia = (lista) => lista[Math.floor(Math.random() * lista.length)];

const brl = (v) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Preço falado: "39 reais e 90 centavos"
function precoFalado(v) {
  const reais = Math.floor(v);
  const centavos = Math.round((v - reais) * 100);
  return centavos ? `${reais} reais e ${centavos} centavos` : `${reais} reais`;
}

// Encurta o título da Shopee (que costuma ser enorme) para algo falável.
export function nomeCurto(nome, maxPalavras = 6) {
  const limpo = nome
    .replace(/\[.*?\]|\(.*?\)|【.*?】/g, " ")
    .replace(/[|/+_*#!]/g, " ")
    .replace(/\b(promoção|promocao|oferta|envio imediato|pronta entrega|original|frete grátis|kit)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return limpo.split(" ").slice(0, maxPalavras).join(" ");
}

const GANCHOS = [
  "Gente, vem ver o que eu achei na Shopee!",
  "Para tudo! Esse achadinho tá bombando na Shopee.",
  "Você precisa conhecer esse achadinho!",
  "Esse é o produto que todo mundo tá comprando agora.",
  "Achei o queridinho da Shopee do momento!",
];

const CTAS = [
  "O link tá aqui no vídeo. Corre antes que acabe!",
  "Clica no link do vídeo e garante o seu!",
  "Toca no produto aqui embaixo e aproveita o preço!",
];

export function gerarRoteiro(p) {
  const nome = nomeCurto(p.nome);
  const frases = [sorteia(GANCHOS), `Olha só ${artigo(nome)} ${nome}.`];

  if (p.vendas >= 1000) {
    const mil = Math.floor(p.vendas / 1000);
    frases.push(`Já são mais de ${mil} mil vendidos, e com avaliação ${String(p.nota).replace(".", ",")}.`);
  } else if (p.nota) {
    frases.push(`Tem avaliação ${String(p.nota).replace(".", ",")} de 5 estrelas.`);
  }

  if (p.desconto >= 10) {
    frases.push(`Tá com ${Math.round(p.desconto)}% de desconto, saindo por só ${precoFalado(p.preco)}.`);
  } else {
    frases.push(`E sai por só ${precoFalado(p.preco)}.`);
  }

  frases.push(sorteia(CTAS));

  const hashtags = ["#achadinhosshopee", "#shopee", "#achadinhos", "#comprinhas", ...tagsDoNome(nome)];
  const legenda =
    `✨ ${nome} por ${brl(p.preco)}` +
    (p.desconto >= 10 ? ` (${Math.round(p.desconto)}% OFF)` : "") +
    `\n🛒 Link: ${p.link}\n\n${hashtags.join(" ")}`;

  return { titulo: nome, frases, legenda, hashtags };
}

// "o" / "a" pelo final da primeira palavra — simples, mas acerta a maioria.
function artigo(nome) {
  const w = nome.split(" ")[0].toLowerCase();
  return /a$|ção$|dade$|gem$/.test(w) ? "essa" : "esse";
}

function tagsDoNome(nome) {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(" ")
    .filter((w) => w.length > 4 && /^[a-z]+$/.test(w))
    .slice(0, 2)
    .map((w) => `#${w}`);
}

export { brl };
