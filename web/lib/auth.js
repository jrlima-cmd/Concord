// Login do administrador: e-mail + senha, guardada no banco só como hash
// scrypt (não dá para recuperar a senha a partir dele). A sessão é um cookie
// assinado com SESSAO_SEGREDO que leva a validade e a "versão" da conta:
// trocar a senha ou encerrar as sessões muda a versão e derruba todo acesso aberto.
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { supabase } from "@/lib/supabase";

const scrypt = promisify(scryptCb);

export const COOKIE = "concord_sessao";
export const VALIDADE_SEG = 60 * 60 * 24 * 30;

const segredo = () => process.env.SESSAO_SEGREDO;
const assinar = (texto) => createHmac("sha256", `concord:${segredo()}`).update(texto).digest("hex");

// Comparação em tempo constante: não revela quantos caracteres acertou.
function iguais(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function gerarHash(senha) {
  const sal = randomBytes(16);
  const hash = await scrypt(senha, sal, 64);
  return `scrypt:${sal.toString("hex")}:${hash.toString("hex")}`;
}

// Hash de mentira usado quando o e-mail não confere, para a resposta levar
// o mesmo tempo e não revelar se o e-mail existe.
const HASH_FALSO = `scrypt:${"0".repeat(32)}:${"0".repeat(128)}`;

export async function conferirSenha(senha, guardado = HASH_FALSO) {
  const [, salHex, hashHex] = String(guardado).split(":");
  if (!salHex || !hashHex) return false;
  const hash = await scrypt(String(senha), Buffer.from(salHex, "hex"), 64);
  return iguais(hash.toString("hex"), hashHex);
}

export const mesmoEmail = (a, b) => iguais(String(a).trim().toLowerCase(), String(b).trim().toLowerCase());

export async function buscarConta() {
  const { data, error } = await supabase().from("admin_conta").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  return data;
}

export function criarToken(versao) {
  const expira = Math.floor(Date.now() / 1000) + VALIDADE_SEG;
  const corpo = `${expira}.${versao}`;
  return `${corpo}.${assinar(corpo)}`;
}

export async function sessaoValida(token) {
  if (!segredo() || typeof token !== "string") return false;
  const [expira, versao, assinatura] = token.split(".");
  if (!/^\d{10}$/.test(expira) || !/^\d{1,9}$/.test(versao)) return false;
  if (Number(expira) < Date.now() / 1000) return false;
  if (!iguais(assinatura, assinar(`${expira}.${versao}`))) return false;
  try {
    const conta = await buscarConta();
    return Boolean(conta) && conta.sessao_versao === Number(versao);
  } catch {
    return false;
  }
}
