// Montagem do vídeo vertical 9:16 (1080x1920) com ffmpeg.
//
// Layout:
//   ┌──────────────────────┐
//   │  [ACHADINHO SHOPEE]  │  selo laranja
//   │   Nome do produto    │
//   │ ┌──────────────────┐ │
//   │ │  foto c/ zoom    │ │  fundo = mesma foto desfocada
//   │ └──────────────────┘ │
//   │   [R$ 39,90] -45%    │
//   │  legenda sincronizada│  acompanha a narração
//   └──────────────────────┘
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets");
const FONTE_FORTE = path.join(ASSETS, "fonts", "Poppins-ExtraBold.ttf");
const FONTE = path.join(ASSETS, "fonts", "Poppins-SemiBold.ttf");
const LARANJA = "0xEE4D2D";
const W = 1080;
const H = 1920;
const FPS = 30;

export function run(args, bin = "ffmpeg") {
  return new Promise((resolve, reject) => {
    const full = bin === "ffmpeg" ? ["-y", "-hide_banner", "-loglevel", "error", ...args] : args;
    const p = spawn(bin, full);
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${bin} falhou: ${err}`))));
  });
}

export async function duracao(arquivo) {
  const out = await run(
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", arquivo],
    "ffprobe",
  );
  return Number(out.trim());
}

// Quebra o texto em linhas de até `max` caracteres.
export function quebrar(texto, max) {
  const linhas = [];
  let atual = "";
  for (const palavra of texto.split(/\s+/)) {
    if ((atual + " " + palavra).trim().length > max && atual) {
      linhas.push(atual);
      atual = palavra;
    } else {
      atual = (atual + " " + palavra).trim();
    }
  }
  if (atual) linhas.push(atual);
  return linhas.join("\n");
}

// Imagem de exemplo para o modo demonstração.
export async function imagemDemo(produto, arquivo) {
  const txt = path.join(path.dirname(arquivo), "demo.txt");
  await fs.writeFile(txt, quebrar(produto.titulo || produto.nome, 16));
  await run([
    "-f", "lavfi", "-i", `color=c=${produto.cor || "0xF6A6B2"}:s=1080x1080`,
    "-vf", `drawtext=fontfile=${FONTE_FORTE}:textfile=${txt}:fontsize=72:fontcolor=white:` +
      `x=(w-text_w)/2:y=(h-text_h)/2:line_spacing=12:borderw=4:bordercolor=0x00000055`,
    "-frames:v", "1", arquivo,
  ]);
}

async function musicaAleatoria() {
  try {
    const dir = path.join(ASSETS, "music");
    const faixas = (await fs.readdir(dir)).filter((f) => /\.(mp3|m4a|wav)$/i.test(f));
    if (!faixas.length) return null;
    return path.join(dir, faixas[Math.floor(Math.random() * faixas.length)]);
  } catch {
    return null;
  }
}

// Escapa um caminho para uso dentro de opções de filtro do ffmpeg.
const esc = (p) => p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");

export async function renderizar({ imagem, titulo, preco, desconto, narracao, saida, tmp }) {
  const total = narracao.total + 1.2;
  let n = 0;
  // drawtext não centraliza linha a linha, então cada linha vira um filtro.
  const texto = async (conteudo, { fonte = FONTE_FORTE, tamanho, y, max = 99, maxLinhas = 9, estilo = "", enable = "" }) => {
    const linhas = quebrar(conteudo, max).split("\n").slice(0, maxLinhas);
    const filtros = [];
    for (const [i, linha] of linhas.entries()) {
      const f = path.join(tmp, `txt${n++}.txt`);
      await fs.writeFile(f, linha);
      filtros.push(
        `drawtext=fontfile=${esc(fonte)}:textfile=${esc(f)}:expansion=none:fontsize=${tamanho}:` +
          `x=(w-text_w)/2:y=${y + i * Math.round(tamanho * 1.3)}:${estilo}` +
          (enable ? `:enable='${enable}'` : ""),
      );
    }
    return filtros;
  };

  const quadros = Math.ceil(total * FPS);
  // Alterna entre aproximar e afastar para os vídeos não ficarem iguais.
  const zoom = Math.random() < 0.5
    ? `min(1+0.12*on/${quadros},1.12)`
    : `max(1.12-0.12*on/${quadros},1)`;

  const filtros = [
    // Fundo: foto preenchendo a tela, desfocada e escurecida
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=40:2,eq=brightness=-0.12[fundo]`,
    // Foto principal com zoom lento + borda branca
    `[0:v]scale=2400:2400:force_original_aspect_ratio=decrease,pad=2400:2400:(ow-iw)/2:(oh-ih)/2:white,` +
      `zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=900x900:fps=${FPS},` +
      `pad=924:924:12:12:white[foto]`,
    `[fundo][foto]overlay=(W-w)/2:450[v0]`,
  ];

  const caixa = (cor, borda) => `box=1:boxcolor=${cor}:boxborderw=${borda}`;
  const contorno = "fontcolor=white:borderw=6:bordercolor=black@0.75";
  const camadas = [
    ...(await texto("ACHADINHO SHOPEE", { tamanho: 46, y: 130, estilo: `fontcolor=white:${caixa(LARANJA, 22)}` })),
    ...(await texto(titulo, { tamanho: 60, y: 235, max: 24, maxLinhas: 2, estilo: contorno })),
    ...(await texto(preco, { tamanho: 92, y: 1440, estilo: `fontcolor=white:${caixa(LARANJA, 26)}` })),
  ];
  if (desconto >= 10) {
    // Etiqueta amarela no canto da foto
    const f = path.join(tmp, "desconto.txt");
    await fs.writeFile(f, `-${Math.round(desconto)}%`);
    camadas.push(
      `drawtext=fontfile=${esc(FONTE_FORTE)}:textfile=${esc(f)}:expansion=none:fontsize=64:fontcolor=${LARANJA}:` +
        `${caixa("0xFFE600", 18)}:x=w-text_w-110:y=490`,
    );
  }
  // Legendas sincronizadas com a narração
  for (const t of narracao.trechos) {
    camadas.push(
      ...(await texto(t.texto, {
        fonte: FONTE, tamanho: 54, y: 1625, max: 28, estilo: contorno,
        enable: `between(t,${t.inicio.toFixed(2)},${t.fim.toFixed(2)})`,
      })),
    );
  }
  // Chamada final piscando durante a última frase
  const inicioCta = narracao.trechos.at(-1).inicio;
  camadas.push(
    ...(await texto("LINK NO VÍDEO", {
      tamanho: 50, y: 1305, estilo: `fontcolor=black:${caixa("white", 18)}`,
      enable: `gte(t,${inicioCta.toFixed(2)})*lt(mod(t,0.8),0.55)`,
    })),
  );
  filtros.push(`[v0]${camadas.join(",")},format=yuv420p[v]`);

  const musica = await musicaAleatoria();
  const entradas = ["-loop", "1", "-i", imagem, "-i", narracao.audio];
  if (musica) {
    entradas.push("-stream_loop", "-1", "-i", musica);
    filtros.push(
      `[2:a]volume=0.10,afade=t=out:st=${(total - 1.5).toFixed(2)}:d=1.5[m]`,
      `[1:a]apad[voz]`,
      `[voz][m]amix=inputs=2:duration=first:dropout_transition=0,volume=2[a]`,
    );
  } else {
    filtros.push(`[1:a]apad[a]`);
  }

  await run([
    ...entradas,
    "-filter_complex", filtros.join(";"),
    "-map", "[v]", "-map", "[a]",
    "-t", total.toFixed(2), "-r", String(FPS),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k",
    "-movflags", "+faststart",
    saida,
  ]);
  return { duracao: total };
}
