// Robô: escolhe um produto em alta, monta o vídeo com trilha temática e
// manda para a fila do painel.
//
//   npm run gerar                      # 1 vídeo, publica no Supabase
//   npm run gerar -- --quantidade 4    # vários de uma vez
//   npm run gerar:teste                # sem Supabase, salva em ./saida
//   npm run gerar:teste -- --imagem foto.jpg   # testa com uma foto sua
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buscarEmAlta, modoDemo } from "./shopee.js";
import { gerarDescricao, brl } from "./descricao.js";
import { detectarTema } from "./tema.js";
import { renderizar, imagemDemo } from "./ffmpeg.js";
import { produtosRecentes, salvarVideo } from "./banco.js";

const args = process.argv.slice(2);
const semUpload = args.includes("--sem-upload");
const valor = (nome) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
};
const quantidade = Number(valor("--quantidade") || 1);
const imagemTeste = valor("--imagem");

async function baixarImagem(url, arquivo) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar imagem (${res.status}): ${url}`);
  await fs.writeFile(arquivo, Buffer.from(await res.arrayBuffer()));
}

async function gerarUm(produto) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "concord-"));
  try {
    const tema = detectarTema(produto.nome);
    const { titulo, legenda } = gerarDescricao(produto, tema);
    console.log(`\n▶ ${titulo} — ${brl(produto.preco)} (tema: ${tema})`);

    const imagem = path.join(tmp, "produto.jpg");
    if (imagemTeste) await fs.copyFile(imagemTeste, imagem);
    else if (produto.imagens[0]) await baixarImagem(produto.imagens[0], imagem);
    else await imagemDemo({ ...produto, titulo }, imagem);

    const saida = path.join(tmp, "video.mp4");
    const { duracao, musicaGerada } = await renderizar({ imagem, tema, saida, tmp });
    console.log(`  Trilha: ${musicaGerada ? "composta pelo robô" : "da pasta assets/music"}`);

    if (semUpload) {
      const pasta = path.resolve("saida");
      await fs.mkdir(pasta, { recursive: true });
      const destino = path.join(pasta, `${produto.itemId}.mp4`);
      await fs.copyFile(saida, destino);
      await fs.writeFile(destino.replace(/\.mp4$/, ".txt"), legenda);
      console.log(`  ✓ Salvo em ${destino} (${duracao.toFixed(1)}s)`);
    } else {
      const id = await salvarVideo({ arquivo: saida, produto, titulo, legenda, tema, duracao });
      console.log(`  ✓ Na fila do painel (id ${id}, ${duracao.toFixed(1)}s)`);
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

async function main() {
  if (modoDemo()) {
    console.log("⚠ Sem SHOPEE_APP_ID/SHOPEE_SECRET: usando produtos de demonstração.");
  }
  const usados = semUpload ? new Set() : await produtosRecentes();
  const candidatos = await buscarEmAlta(usados);
  if (!candidatos.length) {
    console.log("Nenhum produto novo em alta encontrado.");
    return;
  }

  let feitos = 0;
  for (const produto of candidatos) {
    if (feitos >= quantidade) break;
    try {
      await gerarUm(produto);
      feitos++;
    } catch (e) {
      // Um produto com problema (imagem quebrada etc.) não deve parar o robô.
      console.error(`  ✗ Erro em ${produto.itemId}: ${e.message}`);
    }
  }
  if (!feitos) process.exit(1);
  console.log(`\nPronto: ${feitos} vídeo(s) gerado(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
