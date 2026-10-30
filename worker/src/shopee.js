// Busca produtos em alta pela API oficial de Afiliados da Shopee.
// Docs: Portal de Afiliados > Open API (https://affiliate.shopee.com.br/open_api)
import crypto from "node:crypto";

const ENDPOINT = "https://open-api.affiliate.shopee.com.br/graphql";

// sortType: 2 = mais vendidos, 5 = maior comissão
const QUERY = `query ($page: Int, $limit: Int, $sortType: Int, $keyword: String) {
  productOfferV2(page: $page, limit: $limit, sortType: $sortType, keyword: $keyword, listType: 2) {
    nodes {
      itemId productName priceMin priceMax priceDiscountRate
      imageUrl offerLink productLink shopName
      sales ratingStar commissionRate
    }
  }
}`;

async function chamarApi(variables) {
  const appId = process.env.SHOPEE_APP_ID;
  const secret = process.env.SHOPEE_SECRET;
  const payload = JSON.stringify({ query: QUERY, variables });
  const timestamp = Math.floor(Date.now() / 1000);
  const assinatura = crypto
    .createHash("sha256")
    .update(`${appId}${timestamp}${payload}${secret}`)
    .digest("hex");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${assinatura}`,
    },
    body: payload,
  });
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`API Shopee: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  return json.data.productOfferV2.nodes;
}

function normalizar(p) {
  return {
    itemId: String(p.itemId),
    nome: p.productName,
    preco: Number(p.priceMin),
    precoMax: Number(p.priceMax),
    desconto: Number(p.priceDiscountRate) || 0,
    imagens: [p.imageUrl],
    link: p.offerLink,
    loja: p.shopName,
    vendas: Number(p.sales) || 0,
    nota: Number(p.ratingStar) || 0,
    comissao: Number(p.commissionRate) || 0,
  };
}

const DEMO = [
  { itemId: "demo-0", nome: "Kit Cortador de Biscoito Natal com Carimbo 3 Peças", preco: 24.9, precoMax: 24.9, desconto: 38, vendas: 5600, nota: 4.9, comissao: 0.1, loja: "Loja Demo", cor: "0xA9D6F5" },
  { itemId: "demo-1", nome: "Mini Liquidificador Portátil Recarregável USB 380ml", preco: 39.9, precoMax: 39.9, desconto: 45, vendas: 12800, nota: 4.8, comissao: 0.08, loja: "Loja Demo", cor: "0xF6A6B2" },
  { itemId: "demo-2", nome: "Organizador de Maquiagem Giratório 360° Acrílico", preco: 54.9, precoMax: 59.9, desconto: 30, vendas: 7400, nota: 4.9, comissao: 0.1, loja: "Loja Demo", cor: "0xB8D8F0" },
  { itemId: "demo-3", nome: "Luminária LED Nuvem Decorativa com Controle", preco: 29.9, precoMax: 29.9, desconto: 50, vendas: 21500, nota: 4.7, comissao: 0.07, loja: "Loja Demo", cor: "0xFFE29A" },
  { itemId: "demo-4", nome: "Garrafa Térmica Inox 1 Litro com Infusor", preco: 49.9, precoMax: 49.9, desconto: 35, vendas: 9900, nota: 4.8, comissao: 0.09, loja: "Loja Demo", cor: "0xC9E4C5" },
  { itemId: "demo-5", nome: "Escova Secadora Alisadora 3 em 1 Bivolt", preco: 89.9, precoMax: 99.9, desconto: 40, vendas: 15300, nota: 4.8, comissao: 0.11, loja: "Loja Demo", cor: "0xE3C6F2" },
].map((p) => ({ ...p, imagens: [], link: "https://shopee.com.br/" }));

export function modoDemo() {
  return !process.env.SHOPEE_APP_ID || !process.env.SHOPEE_SECRET;
}

// Retorna o ranking de produtos em alta, do melhor para o pior, cada um
// com sua `pontuacao`. Quem decide pular os já usados é quem chama.
export async function buscarEmAlta() {
  if (modoDemo()) {
    return DEMO.map((p) => ({ ...p, pontuacao: score(p) })).sort((a, b) => b.pontuacao - a.pontuacao);
  }

  const palavras = (process.env.PALAVRAS_CHAVE || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const buscas = palavras.length ? palavras : [undefined];

  const todos = new Map();
  for (const keyword of buscas) {
    for (const sortType of [2, 5]) {
      const nodes = await chamarApi({ page: 1, limit: 50, sortType, keyword });
      for (const n of nodes) {
        const p = normalizar(n);
        if (p.imagens[0]) todos.set(p.itemId, p);
      }
    }
  }

  const notaMin = Number(process.env.NOTA_MINIMA || 4.5);
  // Pontuação: vendas pesam mais, comissão desempata.
  return [...todos.values()]
    .filter((p) => p.nota >= notaMin)
    .map((p) => ({ ...p, pontuacao: score(p) }))
    .sort((a, b) => b.pontuacao - a.pontuacao);
}

function score(p) {
  return Math.log10(p.vendas + 1) * 10 + p.comissao * 100 + p.desconto / 10;
}
