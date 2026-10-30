// Proteção simples por senha: o cookie guarda um hash da senha do painel.
export const COOKIE = "concord_sessao";

export async function hashSenha(senha) {
  const dados = new TextEncoder().encode(`concord:${senha}`);
  const hash = await crypto.subtle.digest("SHA-256", dados);
  return Buffer.from(hash).toString("hex");
}

export async function tokenValido(token) {
  const senha = process.env.DASHBOARD_PASSWORD;
  if (!senha || !token) return false;
  return token === (await hashSenha(senha));
}
