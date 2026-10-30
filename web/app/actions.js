"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { COOKIE, hashSenha, tokenValido } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

async function exigirLogin() {
  const jar = await cookies();
  if (!(await tokenValido(jar.get(COOKIE)?.value))) redirect("/login");
}

export async function entrar(_estado, form) {
  const senha = String(form.get("senha") || "");
  if (!process.env.DASHBOARD_PASSWORD || senha !== process.env.DASHBOARD_PASSWORD) {
    return { erro: "Senha incorreta." };
  }
  const jar = await cookies();
  jar.set(COOKIE, await hashSenha(senha), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 90,
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
  if (!["pendente", "postado", "descartado"].includes(status)) throw new Error("Status inválido");
  const { error } = await supabase()
    .from("videos")
    .update({ status, postado_em: status === "postado" ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

// Dispara o robô no GitHub Actions na hora, sem esperar o próximo horário.
export async function gerarAgora() {
  await exigirLogin();
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
      body: JSON.stringify({ ref: process.env.GITHUB_BRANCH || "main", inputs: { quantidade: "1" } }),
    },
  );
  if (!res.ok) return { erro: `GitHub respondeu ${res.status}. Confira o token.` };
  return { ok: "Robô iniciado! O vídeo aparece aqui em uns 3 minutos." };
}
