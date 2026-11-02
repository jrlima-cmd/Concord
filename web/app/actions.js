"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { COOKIE, VALIDADE_SEG, criarToken, senhaCorreta, tokenValido } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

async function exigirLogin() {
  const jar = await cookies();
  if (!(await tokenValido(jar.get(COOKIE)?.value))) redirect("/login");
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

async function tentativasRecentes(db, ip) {
  const desde = new Date(Date.now() - JANELA_MS).toISOString();
  const contar = () =>
    db.from("login_tentativas").select("id", { count: "exact", head: true }).gte("criado_em", desde);
  const [porIp, geral] = await Promise.all([contar().eq("ip", ip), contar()]);
  if (porIp.error || geral.error) return null;
  return { porIp: porIp.count ?? 0, geral: geral.count ?? 0 };
}

export async function entrar(_estado, form) {
  const senha = String(form.get("senha") || "").slice(0, 200);
  const db = supabase();
  const ip = await idDoVisitante();

  const tentativas = await tentativasRecentes(db, ip);
  if (!tentativas) return { erro: "Não foi possível verificar o acesso agora. Tente de novo em instantes." };
  if (tentativas.porIp >= LIMITE_POR_IP || tentativas.geral >= LIMITE_GERAL) {
    return { erro: "Muitas tentativas erradas. Espere 15 minutos e tente de novo." };
  }

  if (!(await senhaCorreta(senha))) {
    await db.from("login_tentativas").insert({ ip });
    // Limpa registros antigos para a tabela não crescer à toa
    await db.from("login_tentativas").delete().lt("criado_em", new Date(Date.now() - 864e5).toISOString());
    await new Promise((r) => setTimeout(r, 800));
    return { erro: "Senha incorreta." };
  }

  const jar = await cookies();
  jar.set(COOKIE, await criarToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: VALIDADE_SEG,
    path: "/",
  });
  redirect("/");
}

export async function sair() {
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
