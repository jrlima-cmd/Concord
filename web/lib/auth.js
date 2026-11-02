// Sessão do painel: o cookie leva a data de validade assinada com HMAC.
// Trocar DASHBOARD_PASSWORD derruba na hora todas as sessões abertas.
export const COOKIE = "concord_sessao";
export const VALIDADE_SEG = 60 * 60 * 24 * 30;

const enc = new TextEncoder();
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

async function assinar(texto) {
  const chave = await crypto.subtle.importKey(
    "raw",
    enc.encode(`concord:${process.env.DASHBOARD_PASSWORD}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", chave, enc.encode(texto)));
}

// Comparação em tempo constante: não revela quantos caracteres acertou.
function iguais(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

export async function senhaCorreta(senha) {
  const certa = process.env.DASHBOARD_PASSWORD;
  if (!certa || typeof senha !== "string") return false;
  return iguais(await assinar(`senha:${senha}`), await assinar(`senha:${certa}`));
}

export async function criarToken() {
  const expira = Math.floor(Date.now() / 1000) + VALIDADE_SEG;
  return `${expira}.${await assinar(String(expira))}`;
}

export async function tokenValido(token) {
  if (!process.env.DASHBOARD_PASSWORD || typeof token !== "string") return false;
  const [expira, assinatura] = token.split(".");
  if (!/^\d{10}$/.test(expira) || Number(expira) < Date.now() / 1000) return false;
  return iguais(assinatura, await assinar(expira));
}
