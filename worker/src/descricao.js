// Monta a descrição do post no formato aprovado: o título do produto como
// está na Shopee + hashtags. O vídeo não tem texto; o link vai no produto
// marcado no post (e fica à mão no painel).

export const brl = (v) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Encurta o título da Shopee (que costuma ser enorme).
export function nomeCurto(nome, maxPalavras = 7) {
  const limpo = nome
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F\u200D]/gu, "") // emojis
    .replace(/\[.*?\]|\(.*?\)|【.*?】/g, " ")
    .replace(/[|/+_*#!]/g, " ")
    .replace(/(^|\s)(promoção|promocao|oferta|envio imediato|pronta entrega|original|frete grátis)(?=\s|$)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return limpo.split(" ").slice(0, maxPalavras).join(" ");
}

const TAGS_TEMA = {
  natal: "#Natal",
  cozinha: "#Cozinha",
  beleza: "#Beleza",
  casa: "#Casa",
  tecnologia: "#Tecnologia",
  infantil: "#Bebe",
  pet: "#Pet",
  fitness: "#Fitness",
  moda: "#Moda",
  geral: "#Achadinhos",
};

const IGNORAR = new Set([
  "para", "com", "sem", "kit", "pcs", "pecas", "unidades", "conjunto", "novo", "nova",
  "moderno", "moderna", "mini", "super", "festa", "promocao", "lancamento", "premium", "luxo",
]);

// Hashtag do produto: primeira palavra relevante do título ("#Cortador").
function tagDoProduto(nome, tema) {
  const palavra = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^A-Za-z]+/)
    .find((w) => w.length > 3 && !IGNORAR.has(w.toLowerCase()) && w.toLowerCase() !== tema);
  return palavra ? `#${palavra[0].toUpperCase()}${palavra.slice(1).toLowerCase()}` : null;
}

export function gerarDescricao(p, tema) {
  const titulo = nomeCurto(p.nome);
  const tags = [TAGS_TEMA[tema] || TAGS_TEMA.geral, tagDoProduto(nomeCurto(p.nome, 12), tema)]
    .filter((t, i, a) => t && a.indexOf(t) === i);
  return { titulo, legenda: `${p.nome.trim()} ${tags.join(" ")}` };
}
