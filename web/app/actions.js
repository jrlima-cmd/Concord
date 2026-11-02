"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  COOKIE,
  VALIDADE_SEG,
  buscarConta,
  conferirSenha,
  criarToken,
  gerarHash,
  mesmoEmail,
  sessaoValida,
} from "@/lib/auth";
import { supabase } from "@/lib/supabase";

async function exigirLogin() {
  const jar = await cookies();
  if (!(await sessaoValida(jar.get(COOKIE)?.value))) redirect("/login");
}

async function gravarSessao(versao) {
  (await cookies()).set(COOKIE, criarToken(versao), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: VALIDADE_SEG,
    path: "/",
  });
}

// Contra quem tenta adivinhar a senha: até 5 erros por endereço a cada 15 min,
// e um teto geral para ataques vindos de muitos endereços ao mesmo tempo.
const JANELA_MS = 15 * 60 * 1000;
const LIMITE_POR_IP = 5;
const LIMITE_GERAL = 50;

async function idDoVisitante() {
  const h = await headers();
  const ip = h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0].trim() || "desconhecido";
  // Guarda só um resumo (hash) do IP, nunca o endereço em si.
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`concord-ip:${ip}`));
  return Buffer.from(hash).toString("hex").slice(0, 32);
}

// Tipo de aparelho para o histórico de acessos (sem IP nem localização).
async function dispositivo() {
  const ua = (await headers()).get("user-agent") || "";
  const tipo = /iphone|ipad/i.test(ua)
    ? "iPhone/iPad"
    : /android/i.test(ua)
      ? "Android"
      : /windows/i.test(ua)
        ? "Computador Windows"
        : /mac os/i.test(ua)
          ? "Mac"
          : /linux/i.test(ua)
            ? "Computador Linux"
            : "Outro";
  return /; wv\)/.test(ua) ? `${tipo} (app Concord)` : tipo;
}

async function tentativasRecentes(db, ip) {
  const desde = new Date(Date.now() - JANELA_MS).toISOString();
  const contar = () =>
    db.from("login_tentativas").select("id", { count: "exact", head: true }).gte("criado_em", desde);
  const [porIp, geral] = await Promise.all([contar().eq("ip", ip), contar()]);
  if (porIp.error || geral.error) return null;
  return { porIp: porIp.count ?? 0, geral: geral.count ?? 0 };
}

export async function entrar(_estado, form) {
  const email = String(form.get("email") || "").slice(0, 200);
  const senha = String(form.get("senha") || "").slice(0, 200);
  const db = supabase();
  const ip = await idDoVisitante();

  const tentativas = await tentativasRecentes(db, ip);
  if (!tentativas) return { erro: "Não foi possível verificar o acesso agora. Tente de novo em instantes." };
  if (tentativas.porIp >= LIMITE_POR_IP || tentativas.geral >= LIMITE_GERAL) {
    return { erro: "Muitas tentativas erradas. Espere 15 minutos e tente de novo." };
  }

  let conta;
  try {
    conta = await buscarConta();
  } catch {
    return { erro: "Não foi possível verificar o acesso agora. Tente de novo em instantes." };
  }
  // A senha é sempre conferida (mesmo com e-mail errado) para o tempo de
  // resposta não revelar se o e-mail existe.
  const emailOk = Boolean(conta) && mesmoEmail(email, conta.email);
  const senhaOk = await conferirSenha(senha, emailOk ? conta.senha_hash : undefined);

  if (!emailOk || !senhaOk) {
    await Promise.all([
      db.from("login_tentativas").insert({ ip }),
      db.from("acessos").insert({ sucesso: false, dispositivo: await dispositivo() }),
    ]);
    // Limpa registros antigos para as tabelas não crescerem à toa
    await Promise.all([
      db.from("login_tentativas").delete().lt("criado_em", new Date(Date.now() - 864e5).toISOString()),
      db.from("acessos").delete().lt("criado_em", new Date(Date.now() - 90 * 864e5).toISOString()),
    ]);
    await new Promise((r) => setTimeout(r, 800));
    return { erro: "E-mail ou senha incorretos." };
  }

  await db.from("acessos").insert({ sucesso: true, dispositivo: await dispositivo() });
  await gravarSessao(conta.sessao_versao);
  redirect("/");
}

export async function sair() {
  (await cookies()).delete(COOKIE);
  redirect("/login");
}

export async function alterarSenha(_estado, form) {
  await exigirLogin();
  const atual = String(form.get("atual") || "");
  const nova = String(form.get("nova") || "");
  const confirmar = String(form.get("confirmar") || "");

  const conta = await buscarConta();
  if (!(await conferirSenha(atual, conta.senha_hash))) return { erro: "A senha atual está errada." };
  if (nova.length < 12 || nova.length > 200) return { erro: "A senha nova precisa ter pelo menos 12 caracteres." };
  if (nova !== confirmar) return { erro: "A confirmação não é igual à senha nova." };
  if (nova === atual) return { erro: "A senha nova precisa ser diferente da atual." };

  const versao = conta.sessao_versao + 1;
  const { error } = await supabase()
    .from("admin_conta")
    .update({ senha_hash: await gerarHash(nova), sessao_versao: versao, atualizado_em: new Date().toISOString() })
    .eq("id", 1);
  if (error) return { erro: "Não foi possível salvar. Tente de novo." };
  // Os outros aparelhos saem; este continua conectado.
  await gravarSessao(versao);
  return { ok: "Senha alterada. Os outros aparelhos foram desconectados." };
}

export async function encerrarSessoes() {
  await exigirLogin();
  const conta = await buscarConta();
  await supabase()
    .from("admin_conta")
    .update({ sessao_versao: conta.sessao_versao + 1, atualizado_em: new Date().toISOString() })
    .eq("id", 1);
  (await cookies()).delete(COOKIE);
  redirect("/login");
}

export async function mudarStatus(id, status) {
  await exigirLogin();
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) throw new Error("Vídeo inválido");
  if (!["pendente", "postado", "descartado"].includes(status)) throw new Error("Status inválido");
  const { error } = await supabase()
    .from("videos")
    .update({ status, postado_em: status === "postado" ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

// Dispara o robô no GitHub Actions na hora, sem esperar o próximo horário.
// Com `item` no formulário, gera o vídeo daquele produto do ranking.
export async function gerarAgora(_estado, form) {
  await exigirLogin();
  const item = String(form?.get("item") || "");
  if (!/^[\w-]{0,40}$/.test(item)) return { erro: "Produto inválido." };
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) {
    return { erro: "Configure GITHUB_REPO e GITHUB_TOKEN na Vercel para usar este botão." };
  }
  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/gerar-videos.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
      body: JSON.stringify({ ref: process.env.GITHUB_BRANCH || "main", inputs: { quantidade: "1", item } }),
    },
  );
  if (!res.ok) return { erro: `GitHub respondeu ${res.status}. Confira o token.` };
  return { ok: "Robô iniciado! O vídeo aparece aqui em uns 3 minutos." };
}
