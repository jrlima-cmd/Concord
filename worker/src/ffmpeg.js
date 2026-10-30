// Montagem do vídeo vertical 9:16 (1080x1920), sem texto na tela, no estilo
// "comercial": cenário no clima do produto, luzinhas desfocadas e 3 cenas
// com a foto do produto (geral -> detalhe -> fechamento), com trilha de fundo.
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { TEMAS } from "./tema.js";
import { fundo, bokeh, mascaraArredondada } from "./png.js";
import { escolherMusica } from "./musica.js";

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

// Imagem de exemplo para o modo demonstração: "produto" em fundo branco,
// como as fotos da Shopee.
export async function imagemDemo(produto, arquivo) {
  const cor = produto.cor || "0xF6A6B2";
  await run([
    "-f", "lavfi", "-i", "color=c=white:s=1000x1000",
    "-vf",
    `drawbox=x=300:y=220:w=400:h=560:color=${cor}:t=fill,` +
      `drawbox=x=360:y=160:w=280:h=80:color=${cor}:t=fill,` +
      `drawbox=x=340:y=300:w=60:h=400:color=white@0.35:t=fill`,
    "-frames:v", "1", arquivo,
  ]);
}

// Brilho médio da foto (0 = preta, 255 = branca)
async function brilhoMedio(imagem) {
  const out = await run([
    "-v", "error", "-f", "lavfi",
    "-i", `movie=${imagem.replace(/[\\:']/g, "\\$&")},scale=64:64,signalstats`,
    "-show_entries", "frame_tags=lavfi.signalstats.YAVG", "-of", "csv=p=0",
  ], "ffprobe");
  return Number(out.trim().split("\n")[0]) || 0;
}

// Cenas: [duração, zoom, x, y] — `p` vai de 0 a 1 ao longo da cena.
const CENAS = [
  // 1. Produto inteiro, aproximando devagar
  [3.6, "1+0.10*p", "(iw-iw/zoom)/2", "(ih-ih/zoom)/2"],
  // 2. Close no detalhe, passeando pela foto
  [3.4, "1.75", "(iw-iw/zoom)*(0.15+0.7*p)", "(ih-ih/zoom)*0.45"],
  // 3. Fechamento: afasta e mostra o produto todo de novo
  [4.0, "1.32-0.32*p", "(iw-iw/zoom)/2", "(ih-ih/zoom)*(0.55-0.05*p)"],
];
const TRANSICAO = 0.5;
const CARTAO = { x: 60, y: 300, w: 960, h: 1280 };

export async function renderizar({ imagem, tema, saida, tmp }) {
  const cfg = TEMAS[tema] || TEMAS.geral;
  const total = CENAS.reduce((s, c) => s + c[0], 0) - TRANSICAO * (CENAS.length - 1);

  const arq = (n) => path.join(tmp, n);
  await Promise.all([
    fundo(arq("fundo.png"), W, H, cfg.fundo, CARTAO),
    bokeh(arq("bokeh1.png"), W + 200, H + 200, cfg.luz, 34),
    bokeh(arq("bokeh2.png"), W + 200, H + 200, cfg.luz, 9),
    mascaraArredondada(arq("mascara.png"), CARTAO.w, CARTAO.h, 44),
  ]);
  const musica = await escolherMusica(tema, cfg.musica, total + 0.5, tmp);

  // Foto inteira no formato do cartão (produto nunca cortado); as sobras
  // são preenchidas pela própria foto desfocada. Feito uma vez só, em alta.
  const { w: cw, h: ch } = CARTAO;
  const foto = arq("foto.png");
  await run([
    "-i", imagem,
    "-filter_complex",
    `[0:v]format=rgb24,split[a][b];` +
      // desfoca com folga e só depois recorta, senão as bordas escurecem
      `[a]scale=${cw}:${ch}:force_original_aspect_ratio=increase,crop=${cw}:${ch},` +
      `pad=${cw + 200}:${ch + 200}:100:100,fillborders=left=100:right=100:top=100:bottom=100:mode=smear,` +
      `gblur=sigma=25,crop=${cw}:${ch}:100:100[fundo];` +
      `[b]scale=${cw * 3}:${ch * 3}:force_original_aspect_ratio=decrease[frente];` +
      `[fundo]scale=${cw * 3}:${ch * 3}[f3];[f3][frente]overlay=(W-w)/2:(H-h)/2,setsar=1`,
    "-frames:v", "1", foto,
  ]);

  // Cada cena é renderizada à parte (zoom em alta resolução) — assim o ffmpeg
  // não precisa segurar quadros gigantes na memória esperando a transição.
  const cenas = [];
  for (const [i, [dur, z, x, y]] of CENAS.entries()) {
    const q = Math.round(dur * FPS);
    const sub = (e) => e.replaceAll("p", `(on/${q})`);
    const arquivo = arq(`cena${i}.mp4`);
    await run([
      "-i", foto,
      "-vf",
      `zoompan=z='${sub(z)}':x='${sub(x)}':y='${sub(y)}':d=${q}:s=${cw}x${ch}:fps=${FPS},format=yuv420p`,
      "-frames:v", String(q),
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "10",
      arquivo,
    ]);
    cenas.push(arquivo);
  }

  const entradas = [
    "-i", arq("fundo.png"),      // 0
    "-i", arq("bokeh1.png"),     // 1
    "-i", arq("bokeh2.png"),     // 2
    "-i", arq("mascara.png"),    // 3
    "-i", foto,                  // 4
    ...cenas.flatMap((c) => ["-i", c]), // 5, 6, 7
    "-i", musica.arquivo,        // 8
  ];
  const iMusica = 5 + cenas.length;

  // Foto de estúdio (fundo branco) deixaria o cenário cinza: aí usamos só as
  // cores do tema. Foto de ambiente tinge o cenário com as cores dela.
  const tinta = (await brilhoMedio(imagem)) > 200 ? 0 : 0.45;

  // Imagens são lidas uma vez e repetidas na memória
  const repetir = (i) => `[${i}:v]loop=loop=-1:size=1:start=0,setpts=N/${FPS}/TB[i${i}]`;
  const f = [
    ...[0, 1, 2, 3].map(repetir),
    // A própria foto, bem desfocada, tinge o cenário com as cores do produto
    `[4:v]scale=${W / 4}:${H / 4}:force_original_aspect_ratio=increase,crop=${W / 4}:${H / 4},` +
      `gblur=sigma=12,scale=${W}:${H},format=rgba,colorchannelmixer=aa=${tinta},` +
      `loop=loop=-1:size=1:start=0,setpts=N/${FPS}/TB[tinta]`,
    `[i0][tinta]overlay[base]`,
  ];
  cenas.forEach((_, i) => f.push(`[${5 + i}:v]setpts=PTS-STARTPTS,fps=${FPS}[c${i}]`));
  // Junta as cenas com transições suaves
  let atual = "c0";
  let offset = 0;
  for (let i = 1; i < CENAS.length; i++) {
    offset += CENAS[i - 1][0] - TRANSICAO;
    const prox = i === CENAS.length - 1 ? "cenas" : `x${i}`;
    f.push(`[${atual}][c${i}]xfade=transition=${i % 2 ? "fade" : "smoothleft"}:duration=${TRANSICAO}:offset=${offset.toFixed(2)}[${prox}]`);
    atual = prox;
  }
  f.push(
    // Cartão com cantos arredondados
    `[i3]format=gray[masc]`,
    `[cenas]format=rgba[cr]`,
    `[cr][masc]alphamerge[cartao]`,
    // Cenário: degradê + duas camadas de luzinhas em velocidades diferentes (profundidade)
    `[i1]format=rgba,gblur=sigma=6[b2]`,
    `[base][b2]overlay=x='-100+70*sin(t*0.35)':y='-100+50*cos(t*0.3)':shortest=0[f1]`,
    `[f1][cartao]overlay=x=${CARTAO.x}:y='${CARTAO.y}+6*sin(t*1.2)':shortest=0[f2]`,
    `[i2]format=rgba,colorchannelmixer=aa=0.35[b1]`,
    `[f2][b1]overlay=x='-100-40*sin(t*0.5)':y='-100+30*sin(t*0.45)':shortest=0[f3]`,
    // Tom quente de "comercial" + fades
    `[f3]trim=duration=${total.toFixed(2)},setpts=PTS-STARTPTS,` +
      `eq=saturation=1.08:contrast=1.03,vignette=PI/5,` +
      `fade=t=in:st=0:d=0.4,fade=t=out:st=${(total - 0.5).toFixed(2)}:d=0.5,format=yuv420p[v]`,
    `[${iMusica}:a]atrim=duration=${total.toFixed(2)},afade=t=in:d=0.3,` +
      `afade=t=out:st=${(total - 1.2).toFixed(2)}:d=1.2,aresample=44100[a]`,
  );

  await run([
    ...entradas,
    "-filter_complex", f.join(";"),
    "-map", "[v]", "-map", "[a]",
    "-t", total.toFixed(2), "-r", String(FPS),
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k",
    "-movflags", "+faststart",
    saida,
  ]);
  return { duracao: total, musicaGerada: musica.gerada };
}
