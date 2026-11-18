// Genera previews PNG de los patrones tileables (shared/assets/patterns/*.png) para la web.
// La landing (web/src/app/landing) muestra los patrones con un swatch: antes usaba las máscaras
// vectoriales de shared/assets/sprites (dibujadas con currentColor para el canvas del juego), que
// en un <img> quedan negras y casi invisibles. Aquí se compone la textura real — la misma que el
// escritorio pinta sobre la mascota — sobre un color base neutro, para que cada patrón se vea
// tal cual en el juego. `plain` (Liso) no tiene textura: la web lo muestra con su color sólido.
//
// Sin dependencias: decodifica el PNG con zlib (node built-in) y lo vuelve a codificar con
// deflate. Solo soporta PNG RGBA 8 bits, que es lo que valida scripts/validate-assets.js.
//
// Uso: node scripts/generate-pattern-previews.mjs
import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const patternsDir = join(root, 'shared', 'assets', 'patterns');
const spritesDir = join(root, 'shared', 'assets', 'sprites');
const SIZE = 128; // preview cuadrada que el swatch de la landing recorta a círculo
const BASE = { r: 0x9c, g: 0xa2, b: 0xab }; // gris neutro: se lee la textura, no el tono de rareza

/* ───── Decodificación mínima de PNG (RGBA, 8 bits, no interlaced) ───── */

function decodePng(buf) {
  if (buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('No es un PNG');
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = buf.subarray(pos + 4, pos + 8).toString('ascii');
    const data = buf.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[11] !== 0) throw new Error('PNG interlaced no soportado');
    }
    if (type === 'IDAT') idat.push(data);
    if (type === 'IEND') break;
    pos += 12 + length;
  }
  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(`PNG no soportado (bitDepth=${bitDepth}, colorType=${colorType}): usa RGBA 8 bits`);
  }
  const raw = inflateSync(Buffer.concat(idat));
  const row = width * 4;
  const pixels = new Uint8Array(height * row);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (row + 1)];
    for (let x = 0; x < row; x++) {
      const cur = raw[y * (row + 1) + 1 + x];
      const left = x >= 4 ? pixels[y * row + x - 4] : 0;
      const up = y > 0 ? pixels[(y - 1) * row + x] : 0;
      const ul = x >= 4 && y > 0 ? pixels[(y - 1) * row + x - 4] : 0;
      switch (filter) {
        case 0:
          break;
        case 1:
          cur = (cur + left) & 0xff;
          break;
        case 2:
          cur = (cur + up) & 0xff;
          break;
        case 3:
          cur = (cur + ((left + up) >> 1)) & 0xff;
          break;
        case 4:
          cur = (cur + paeth(left, up, ul)) & 0xff;
          break;
        default:
          throw new Error(`Filtro PNG desconocido: ${filter}`);
      }
      pixels[y * row + x] = cur;
    }
  }
  return { width, height, pixels };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/* ───── Codificación mínima de PNG (RGBA, 8 bits, sin filtros) ───── */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(width, height, pixels) {
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // sin filtro
    Buffer.from(pixels.buffer, y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ───── Composición: textura tileable sobre color base, recorte central ───── */

function makePreview(pattern) {
  const { width, height, pixels } = pattern;
  const out = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const px = ((y + (height - SIZE) >> 1) * width + (x + (width - SIZE) >> 1)) * 4;
      const o = (y * SIZE + x) * 4;
      const a = pixels[px + 3] / 255;
      out[o] = Math.round(BASE.r * (1 - a) + pixels[px] * a);
      out[o + 1] = Math.round(BASE.g * (1 - a) + pixels[px + 1] * a);
      out[o + 2] = Math.round(BASE.b * (1 - a) + pixels[px + 2] * a);
      out[o + 3] = 255;
    }
  }
  return encodePng(SIZE, SIZE, out);
}

const generated = [];
for (const file of readdirSync(patternsDir).filter((f) => f.endsWith('.png')).sort()) {
  const id = file.slice(0, -4);
  const preview = makePreview(decodePng(readFileSync(join(patternsDir, file))));
  const target = join(spritesDir, `pattern_${id}_preview.png`);
  writeFileSync(target, preview);
  generated.push(`pattern_${id}_preview.png (${preview.length} B)`);
}
console.log(`generate-pattern-previews: ${generated.length} previews → ${spritesDir}`);
for (const file of generated) console.log(`  ${file}`);