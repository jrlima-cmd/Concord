// Robô: escolhe um produto em alta, gera roteiro + narração + vídeo e
// manda para a fila de aprovação no site.
//
//   npm run gerar                      # 1 vídeo, publica no Supabase
//   npm run gerar -- --quantidade 4    # vários de uma vez
//   npm run gerar:teste                # sem internet/Supabase, salva em ./saida
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buscarEmAlta, modoDemo } from "./shopee.js";
import { gerarRoteiro, brl } from "./roteiro.js";
import { narrar } from "./voz.js";
import { renderizar, imagemDemo } from "./ffmpeg.js";
import { produtosRecentes, salvarVideo } from "./banco.js";

const args = process.argv.slice(2);
const offline = args.includes("--offline");
const semUpload = args.includes("--sem-upload");
const iQtd = args.indexOf("--quantidade");
const quantidade = iQtd >= 0 ? Number(args[iQtd + 1]) : 1;

async function baixarImagem(url, arquivo) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar imagem (${res.status}): ${url}`);
  await fs.writeFile(arquivo, Buffer.from(await res.arrayBuffer()));
}

async function gerarUm(produto) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "concord-"));
  try {
    const roteiro = gerarRoteiro(produto);
    console.log(`\n▶ ${roteiro.titulo} — ${brl(produto.preco)}`);
    console.log(`  Roteiro: ${roteiro.frases.join(" ")}`);

    const imagem = path.join(tmp, "produto.jpg");
    if (produto.imagens[0]) await baixarImagem(produto.imagens[0], imagem);
    else await imagemDemo({ ...produto, titulo: roteiro.titulo }, imagem);

    const narracao = await narrar(roteiro.frases, tmp, { offline });
    const saida = path.join(tmp, "video.mp4");
    const { duracao } = await renderizar({
      imagem,
      titulo: roteiro.titulo,
      preco: brl(produto.preco),
      desconto: produto.desconto,
      narracao,
      saida,
      tmp,
    });

    if (semUpload) {
      const pasta = path.resolve("saida");
      await fs.mkdir(pasta, { recursive: true });
      const destino = path.join(pasta, `${produto.itemId}.mp4`);
      await fs.copyFile(saida, destino);
      await fs.writeFile(destino.replace(/\.mp4$/, ".txt"), roteiro.legenda);
      console.log(`  ✓ Salvo em ${destino} (${duracao.toFixed(1)}s)`);
    } else {
      const id = await salvarVideo({ arquivo: saida, produto, roteiro, duracao });
      console.log(`  ✓ Na fila de aprovação (id ${id}, ${duracao.toFixed(1)}s)`);
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
