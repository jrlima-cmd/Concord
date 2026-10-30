// Monta a descrição do post (o vídeo não tem texto: tudo vai aqui).

const sorteia = (lista) => lista[Math.floor(Math.random() * lista.length)];

export const brl = (v) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Encurta o título da Shopee (que costuma ser enorme).
export function nomeCurto(nome, maxPalavras = 7) {
  const limpo = nome
    .replace(/\[.*?\]|\(.*?\)|【.*?】/g, " ")
    .replace(/[|/+_*#!]/g, " ")
    .replace(/(^|\s)(promoção|promocao|oferta|envio imediato|pronta entrega|original|frete grátis)(?=\s|$)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return limpo.split(" ").slice(0, maxPalavras).join(" ");
}

const ABERTURAS = [
  "✨ Achadinho do dia!",
  "😍 Olha que achado!",
  "🔥 Tá bombando na Shopee!",
  "💖 O queridinho do momento!",
  "🛍️ Achei e precisava mostrar!",
];

const CHAMADAS = [
  "👉 Toque no produto do vídeo e garanta o seu!",
  "👉 Link no produto do vídeo, corre antes que acabe!",
  "👉 Clique no produto e aproveite o preço!",
];

const TAGS_TEMA = {
  natal: ["#natal", "#decoracaodenatal"],
  cozinha: ["#cozinha", "#utilidadesdomesticas"],
  beleza: ["#beleza", "#maquiagem"],
  casa: ["#casa", "#decoracao"],
  tecnologia: ["#tecnologia", "#gadgets"],
  infantil: ["#bebe", "#maternidade"],
  pet: ["#pet", "#petshop"],
  fitness: ["#fitness", "#treino"],
  moda: ["#moda", "#look"],
  geral: [],
};

export function gerarDescricao(p, tema) {
  const titulo = nomeCurto(p.nome);
  const linhas = [sorteia(ABERTURAS), "", `${titulo}`];

  const detalhes = [];
  if (p.desconto >= 10) detalhes.push(`💸 ${brl(p.preco)} com ${Math.round(p.desconto)}% OFF`);
  else detalhes.push(`💸 Só ${brl(p.preco)}`);
  if (p.vendas >= 1000) detalhes.push(`📦 +${Math.floor(p.vendas / 1000)} mil vendidos`);
  if (p.nota) detalhes.push(`⭐ Nota ${String(p.nota).replace(".", ",")}`);
  linhas.push(...detalhes, "", sorteia(CHAMADAS), `🛒 ${p.link}`);

  const hashtags = [
    "#achadinhosshopee", "#shopee", "#achadinhos", "#comprinhas",
    ...(TAGS_TEMA[tema] || []),
  ];
  linhas.push("", hashtags.join(" "));

  return { titulo, legenda: linhas.join("\n") };
}
