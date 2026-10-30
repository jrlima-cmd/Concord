// Gera as imagens auxiliares do cenário (fundo, luzinhas, máscara do cartão)
// direto em PNG, sem depender de bibliotecas gráficas.
import fs from "node:fs/promises";
import zlib from "node:zlib";

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function bloco(tipo, dados) {
  const t = Buffer.from(tipo, "ascii");
  const tam = Buffer.alloc(4);
  tam.writeUInt32BE(dados.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, dados])));
  return Buffer.concat([tam, t, dados, crc]);
}

// rgba: Uint8ClampedArray com w*h*4 valores
export async function salvarPng(arquivo, w, h, rgba) {
  const linhas = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    linhas[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(linhas, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bits
  ihdr[9] = 6; // RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco("IHDR", ihdr),
    bloco("IDAT", zlib.deflateSync(linhas, { level: 6 })),
    bloco("IEND", Buffer.alloc(0)),
  ]);
  await fs.writeFile(arquivo, png);
}

export const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

// Fundo em degradê com vinheta e a sombra do cartão do produto já desenhada.
export async function fundo(arquivo, w, h, [c1, c2], cartao) {
  const a = hex(c1);
  const b = hex(c2);
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = Math.min(1, Math.max(0, y / h * 0.9 + (x / w) * 0.2));
      const dx = (x - w / 2) / (w / 2);
      const dy = (y - h * 0.45) / (h / 2);
      const vinheta = 1 - Math.min(0.55, (dx * dx + dy * dy) * 0.32);
      // sombra suave embaixo do cartão
      const sx = Math.max(0, Math.abs(x - (cartao.x + cartao.w / 2)) - cartao.w / 2 + 30);
      const sy = Math.max(0, Math.abs(y - (cartao.y + cartao.h / 2 + 28)) - cartao.h / 2 + 30);
      const sombra = 1 - 0.45 * Math.exp(-(sx * sx + sy * sy) / (2 * 45 * 45));
      const i = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) px[i + k] = (a[k] + (b[k] - a[k]) * t) * vinheta * sombra;
      px[i + 3] = 255;
    }
  }
  await salvarPng(arquivo, w, h, px);
}

// Camada de luzinhas desfocadas (bokeh) com transparência.
export async function bokeh(arquivo, w, h, cores, quantidade = 46, aleatorio = Math.random) {
  const px = new Float32Array(w * h * 4);
  for (let n = 0; n < quantidade; n++) {
    const cx = aleatorio() * w;
    const cy = aleatorio() * h;
    const r = 14 + aleatorio() ** 2 * 70;
    const forca = 0.25 + aleatorio() * 0.5;
    const [cr, cg, cb] = hex(cores[Math.floor(aleatorio() * cores.length)]);
    for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(h, cy + r); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(w, cx + r); x++) {
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d > 1) continue;
        // disco com borda levemente mais clara, como luz fora de foco
        const al = forca * (d > 0.85 ? (1 - d) / 0.15 : 0.55 + 0.45 * d * d);
        const i = (y * w + x) * 4;
        const ant = px[i + 3];
        const novo = al + ant * (1 - al);
        if (novo <= 0) continue;
        px[i] = (cr * al + px[i] * ant * (1 - al)) / novo;
        px[i + 1] = (cg * al + px[i + 1] * ant * (1 - al)) / novo;
        px[i + 2] = (cb * al + px[i + 2] * ant * (1 - al)) / novo;
        px[i + 3] = novo;
      }
    }
  }
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = px[i];
    out[i + 1] = px[i + 1];
    out[i + 2] = px[i + 2];
    out[i + 3] = px[i + 3] * 255;
  }
  await salvarPng(arquivo, w, h, out);
}

// Máscara branca de cantos arredondados para o cartão do produto.
export async function mascaraArredondada(arquivo, w, h, raio) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const qx = Math.max(raio - x, x - (w - 1 - raio), 0);
      const qy = Math.max(raio - y, y - (h - 1 - raio), 0);
      const d = Math.hypot(qx, qy) - raio;
      const v = Math.min(1, Math.max(0, 0.5 - d)) * 255;
      const i = (y * w + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = v;
      px[i + 3] = 255;
    }
  }
  await salvarPng(arquivo, w, h, px);
}
