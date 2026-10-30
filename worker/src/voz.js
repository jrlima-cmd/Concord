// Narração com voz neural feminina (Microsoft Edge TTS, gratuita).
// Cada frase é sintetizada separadamente para sabermos a duração exata
// e sincronizar as legendas.
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import fs from "node:fs/promises";
import path from "node:path";
import { run, duracao } from "./ffmpeg.js";

const VOZ = process.env.VOZ || "pt-BR-FranciscaNeural";
const VELOCIDADE = process.env.VOZ_VELOCIDADE || "-4%";
const TOM = process.env.VOZ_TOM || "-2Hz";
const PAUSA = 0.25; // segundos de respiro entre frases

async function sintetizar(texto, pasta) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(VOZ, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  try {
    const { audioFilePath } = await tts.toFile(pasta, texto, { rate: VELOCIDADE, pitch: TOM });
    return audioFilePath;
  } finally {
    tts.close();
  }
}

// Modo offline (testes locais sem internet): áudio mudo com duração estimada.
async function silencio(texto, arquivo) {
  const seg = Math.max(1.2, texto.split(" ").length * 0.38);
  await run(["-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", seg.toFixed(2), arquivo]);
  return arquivo;
}

// Retorna { audio, trechos: [{ texto, inicio, fim }], total }
export async function narrar(frases, tmp, { offline = false } = {}) {
  const trechos = [];
  const arquivos = [];
  let t = 0;

  for (const [i, texto] of frases.entries()) {
    const pasta = path.join(tmp, `voz-${i}`);
    await fs.mkdir(pasta, { recursive: true });
    const mp3 = offline
      ? await silencio(texto, path.join(pasta, "audio.mp3"))
      : await sintetizarComRetry(texto, pasta);
    const d = await duracao(mp3);
    trechos.push({ texto, inicio: t, fim: t + d });
    arquivos.push(mp3);
    t += d + PAUSA;
  }

  // Junta tudo com pausas entre as frases
  const audio = path.join(tmp, "narracao.m4a");
  const entradas = arquivos.flatMap((a) => ["-i", a]);
  const filtro =
    arquivos.map((_, i) => `[${i}:a]aresample=44100,apad=pad_dur=${PAUSA}[a${i}]`).join(";") +
    ";" +
    arquivos.map((_, i) => `[a${i}]`).join("") +
    `concat=n=${arquivos.length}:v=0:a=1[out]`;
  await run([...entradas, "-filter_complex", filtro, "-map", "[out]", "-c:a", "aac", "-b:a", "160k", audio]);

  return { audio, trechos, total: t };
}

async function sintetizarComRetry(texto, pasta, tentativas = 3) {
  for (let i = 1; ; i++) {
    try {
      return await sintetizar(texto, pasta);
    } catch (e) {
      if (i >= tentativas) throw e;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}
