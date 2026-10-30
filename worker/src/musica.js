// Trilha de fundo do vídeo.
//
// Se existirem músicas em assets/music/<tema>/ (ou assets/music/), sorteia uma.
// Senão, compõe na hora uma trilha original curta no clima do tema — sem
// risco de direitos autorais.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PASTA = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "music");
const SR = 44100;

async function faixas(dir) {
  try {
    return (await fs.readdir(dir))
      .filter((f) => /\.(mp3|m4a|wav|ogg)$/i.test(f))
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

export async function escolherMusica(tema, cfg, duracao, tmp, aleatorio = Math.random) {
  let lista = await faixas(path.join(PASTA, tema));
  if (!lista.length) lista = await faixas(PASTA);
  if (lista.length) return { arquivo: lista[Math.floor(aleatorio() * lista.length)], gerada: false };
  const arquivo = path.join(tmp, "musica.wav");
  await compor(cfg, duracao, arquivo, aleatorio);
  return { arquivo, gerada: true };
}

// ---------------------------------------------------------------- composição

const ESCALAS = {
  maior: [0, 2, 4, 5, 7, 9, 11],
  maior7: [0, 2, 4, 5, 7, 9, 11],
  menor: [0, 2, 3, 5, 7, 8, 10],
};
// Progressões em graus da escala (0 = I)
const PROGRESSOES = {
  maior: [[0, 4, 5, 3], [0, 5, 3, 4], [3, 4, 0, 0], [0, 3, 4, 4]],
  maior7: [[0, 3, 1, 4], [3, 2, 1, 0], [0, 5, 3, 4]],
  menor: [[0, 5, 2, 6], [0, 3, 5, 4], [0, 6, 5, 6]],
};
const ARPEJOS = [[0, 1, 2, 1, 0, 1, 2, 3], [0, 2, 1, 2, 3, 2, 1, 2], [0, 1, 2, 3, 2, 1, 2, 1]];

const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);

function acorde(cfg, grau) {
  const esc = ESCALAS[cfg.escala];
  const nota = (g) => cfg.tom + esc[g % 7] + 12 * Math.floor(g / 7);
  const notas = [nota(grau), nota(grau + 2), nota(grau + 4)];
  if (cfg.escala === "maior7") notas.push(nota(grau + 6));
  return notas;
}

// Envelopes / timbres simples, todos com ataque suave para não "estalar".
function voz(timbre, f, t, dur) {
  if (t < 0 || t > dur + 1.5) return 0;
  const ataque = Math.min(1, t / 0.008);
  const w = 2 * Math.PI * f * t;
  switch (timbre) {
    case "sino": {
      const env = ataque * Math.exp(-t * 2.8);
      return env * (Math.sin(w) + 0.45 * Math.sin(w * 2.76) * Math.exp(-t * 4) + 0.2 * Math.sin(w * 5.4) * Math.exp(-t * 8));
    }
    case "sintetizador": {
      const env = ataque * Math.exp(-t * 3.5);
      return env * (Math.sin(w) + 0.35 * Math.sin(w * 2) + 0.18 * Math.sin(w * 3) + 0.1 * Math.sin(w * 4));
    }
    default: {
      // dedilhado (violão/piano leve)
      const env = ataque * Math.exp(-t * 4.2);
      return env * (Math.sin(w) + 0.5 * Math.sin(w * 2) * Math.exp(-t * 3) + 0.25 * Math.sin(w * 3) * Math.exp(-t * 6));
    }
  }
}

function tapete(f, t, dur) {
  // pad suave: entra e sai devagar
  const env = Math.min(1, t / 0.6) * Math.min(1, Math.max(0, (dur - t) / 0.6));
  if (env <= 0) return 0;
  const w = 2 * Math.PI * f * t;
  return env * (Math.sin(w) + 0.3 * Math.sin(w * 1.003 * 2) + 0.15 * Math.sin(w * 0.997 * 3));
}

export async function compor(cfg, duracao, arquivo, aleatorio = Math.random) {
  const n = Math.ceil(duracao * SR);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const progs = PROGRESSOES[cfg.escala];
  const prog = progs[Math.floor(aleatorio() * progs.length)];
  const arpejo = ARPEJOS[Math.floor(aleatorio() * ARPEJOS.length)];
  const bpm = cfg.bpm + Math.round((aleatorio() - 0.5) * 8);
  const batida = 60 / bpm;
  const compasso = batida * 4;
  const colcheia = batida / 2;

  const somar = (inicio, dur, fn, vol, pan = 0) => {
    const i0 = Math.max(0, Math.floor(inicio * SR));
    const i1 = Math.min(n, Math.floor((inicio + dur + 1.5) * SR));
    for (let i = i0; i < i1; i++) {
      const v = fn((i - i0) / SR) * vol;
      L[i] += v * (1 - pan) ;
      R[i] += v * (1 + pan);
    }
  };

  for (let c = 0; c * compasso < duracao; c++) {
    const t0 = c * compasso;
    const notas = acorde(cfg, prog[c % prog.length]);

    // Pad grave sustentando o acorde
    for (const m of notas.slice(0, 3)) {
      somar(t0, compasso, (t) => tapete(freq(m - 12), t, compasso), 0.05);
    }
    // Baixo
    somar(t0, compasso, (t) => voz("dedilhado", freq(notas[0] - 24), t, compasso), 0.22);
    somar(t0 + batida * 2, compasso / 2, (t) => voz("dedilhado", freq(notas[0] - 24), t, compasso / 2), 0.16);

    // Arpejo / melodia
    for (let k = 0; k < 8; k++) {
      const t = t0 + k * colcheia;
      if (t >= duracao) break;
      if (aleatorio() < 0.12) continue; // respiros deixam menos robótico
      const idx = arpejo[k] % notas.length;
      const oitava = arpejo[k] >= notas.length ? 12 : 0;
      const m = notas[idx] + 12 + oitava;
      const pan = (k % 2 ? 0.35 : -0.35);
      somar(t, colcheia, (tt) => voz(cfg.timbre, freq(m), tt, colcheia), 0.13, pan);
    }

    // Percussão leve
    if (cfg.batida) {
      for (let b = 0; b < 4; b++) {
        const t = t0 + b * batida;
        if (t >= duracao) break;
        if (b % 2 === 0) {
          somar(t, 0.3, (tt) => Math.sin(2 * Math.PI * (55 + 90 * Math.exp(-tt * 30)) * tt) * Math.exp(-tt * 9), 0.32);
        } else {
          somar(t, 0.15, (tt) => (aleatorio() * 2 - 1) * Math.exp(-tt * 25), 0.06);
        }
        somar(t + batida / 2, 0.05, (tt) => (aleatorio() * 2 - 1) * Math.exp(-tt * 70), 0.035, 0.4);
      }
    }
    // Guizos de Natal
    if (cfg.guizo) {
      for (let k = 0; k < 8; k++) {
        const t = t0 + k * colcheia;
        if (t >= duracao) break;
        somar(t, 0.12, (tt) => {
          const r = aleatorio() * 2 - 1;
          return r * Math.exp(-tt * 35) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 6000 * tt));
        }, k % 2 ? 0.05 : 0.08, k % 2 ? 0.5 : -0.5);
      }
    }
  }

  // Eco simples para dar ambiência
  for (const [atraso, ganho] of [[0.19, 0.28], [0.31, 0.2], [0.47, 0.12]]) {
    const d = Math.floor(atraso * SR);
    for (let i = n - 1; i >= d; i--) {
      L[i] += R[i - d] * ganho;
      R[i] += L[i - d] * ganho;
    }
  }

  // Normaliza, fade-out e grava WAV 16 bits
  let pico = 1e-6;
  for (let i = 0; i < n; i++) pico = Math.max(pico, Math.abs(L[i]), Math.abs(R[i]));
  const ganho = 0.85 / pico;
  const fade = Math.floor(1.2 * SR);
  const buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const f = Math.min(1, (n - i) / fade) * Math.min(1, i / (0.05 * SR));
    const l = Math.tanh(L[i] * ganho) * f;
    const r = Math.tanh(R[i] * ganho) * f;
    buf.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(r * 32767), 46 + i * 4);
  }
  await fs.writeFile(arquivo, buf);
}
