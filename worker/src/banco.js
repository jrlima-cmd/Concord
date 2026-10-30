// Acesso ao Supabase: lista de vídeos já feitos e upload do vídeo pronto.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";

const BUCKET = "videos";

function cliente() {
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new Error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, chave, { auth: { persistSession: false } });
}

// Produtos que já viraram vídeo nos últimos 30 dias (para não repetir).
export async function produtosRecentes() {
  const desde = new Date(Date.now() - 30 * 864e5).toISOString();
  const { data, error } = await cliente()
    .from("videos")
    .select("item_id")
    .gte("created_at", desde);
  if (error) throw error;
  return new Set(data.map((r) => r.item_id));
}

export async function salvarVideo({ arquivo, capa, produto, titulo, legenda, prompt, tema, duracao }) {
  const db = cliente();
  const caminho = `${new Date().toISOString().slice(0, 10)}/${produto.itemId}-${Date.now()}.mp4`;

  const enviar = async (destino, origem, contentType) => {
    const { error } = await db.storage
      .from(BUCKET)
      .upload(destino, await fs.readFile(origem), { contentType });
    if (error) throw error;
  };
  await enviar(caminho, arquivo, "video/mp4");
  // Capa com o mesmo nome do vídeo, para o painel não mostrar tela preta
  await enviar(caminho.replace(/\.mp4$/, ".jpg"), capa, "image/jpeg");

  const { data, error } = await db
    .from("videos")
    .insert({
      item_id: produto.itemId,
      nome_produto: produto.nome,
      titulo,
      preco: produto.preco,
      desconto: produto.desconto,
      vendas: produto.vendas,
      nota: produto.nota,
      comissao: produto.comissao,
      imagem_url: produto.imagens[0] || null,
      link_afiliado: produto.link,
      tema,
      legenda,
      prompt,
      video_path: caminho,
      duracao,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}
