// Genera los patrones de piel de shared/assets/patterns/ como pixel art.
//   node scripts/sprites/pixel/patterns.mjs            (pnpm generate:patterns)
//
// Cada píxel del PNG es un píxel NATIVO del sprite (64×64 por frame): el horneado
// (shared/scene/src/bake/bakePixels.ts) lo amplía con la hoja, así que el dibujo cae siempre en la
// rejilla. El PNG mide 256×256 y es tileable; todos los periodos dividen a 256.
//   - blanco opaco  → marca de tono: más clara en especies oscuras, más oscura en las claras
//   - cian opaco    → destello: casi blanco
//   - transparente  → nada
// No hay alfas intermedios: los degradados van con tramado ordenado (Bayer 4×4).
import sharp from 'sharp';

const N = 256;
const TONE = [255, 255, 255];
const GLINT = [80, 220, 255];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Tramado: ¿se pinta el píxel (x, y) con cobertura `a` (0–1)? */
const dither = (x, y, a) => a > (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
const mod = (v, m) => ((v % m) + m) % m;
/** Azar determinista por celda. */
const hash = (x, y, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// Cada patrón: (x, y) → 0 nada, 1 tono, 2 destello.
const PATTERNS = {
  // Motas en tresbolillo, de dos tamaños.
  spots(x, y) {
    const cx = mod(x, 8);
    const cy = mod(y, 8);
    const big = cx >= 1 && cx <= 3 && cy >= 1 && cy <= 3; // 3×3
    const small = cx >= 6 && cx <= 7 && cy >= 5 && cy <= 6; // 2×2
    return big || small ? 1 : 0;
  },
  // Franjas diagonales de 2 píxeles con una fina al lado, como las de un tigre.
  stripes(x, y) {
    const d = mod(x + y, 16);
    return d < 3 || d === 8 ? 1 : 0;
  },
  // Degradado vertical tramado: de lleno a nada cada 32 filas, ida y vuelta.
  gradient(x, y) {
    const t = Math.abs(mod(y, 64) - 32) / 32;
    return dither(x, y, t * 0.9) ? 1 : 0;
  },
  // Escamas: arcos de 1 píxel en filas alternas, con un brillo en lo alto de cada una.
  scales(x, y) {
    const row = Math.floor(y / 4);
    const cx = mod(x + (row & 1 ? 4 : 0), 8) - 3.5;
    const cy = mod(y, 4);
    const d = Math.hypot(cx, cy + 0.5);
    if (d >= 3.6 && d < 4.7) return 1;
    return cy === 1 && Math.abs(cx) < 1 && hash(Math.floor((x + (row & 1 ? 4 : 0)) / 8), row, 3) < 0.35 ? 2 : 0;
  },
  // Cristal: rombos facetados, con media cara tramada y destellos en algunos vértices.
  crystal(x, y) {
    const a = mod(x + y, 16);
    const b = mod(x - y, 16);
    if (a === 0 && b === 0) return hash(x >> 3, y >> 3, 5) < 0.6 ? 2 : 1;
    if (a === 0 || b === 0) return 1;
    return a < 8 && b < 8 && dither(x, y, 0.3) ? 1 : 0;
  },
  // Aurora: cintas verticales que ondulan, con el borde tramado y un hilo de luz dentro.
  aurora(x, y) {
    const wave = Math.round(4 * Math.sin((2 * Math.PI * y) / 64) + 2 * Math.sin((2 * Math.PI * y) / 32));
    const d = mod(x + wave, 32);
    if (d === 4 && mod(y, 8) < 5) return 2;
    if (d >= 2 && d < 8) return 1;
    if (d >= 8 && d < 13) return dither(x, y, (13 - d) / 6) ? 1 : 0;
    return 0;
  },
  // Galaxia: nebulosa tramada con estrellas de un píxel y alguna en cruz.
  galaxy(x, y) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const sx = mod(x + dx, N);
      const sy = mod(y + dy, N);
      const h = hash(sx, sy, 7);
      if (h < 0.006 && (dx === 0 || dy === 0)) return 2; // estrella en cruz
      if (h < 0.03 && dx === 0 && dy === 0) return 2; // estrella de un píxel
    }
    const neb = 0.5 + 0.28 * Math.sin((2 * Math.PI * (x + y)) / 32) + 0.22 * Math.sin((2 * Math.PI * (x - 2 * y)) / 64);
    return dither(x, y, Math.max(0, neb - 0.35) * 0.9) ? 1 : 0;
  },
};

for (const [id, fn] of Object.entries(PATTERNS)) {
  const buf = Buffer.alloc(N * N * 4);
  let on = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = fn(x, y);
    if (!v) continue;
    on++;
    const c = v === 2 ? GLINT : TONE;
    buf.set([c[0], c[1], c[2], 255], (y * N + x) * 4);
  }
  await sharp(buf, { raw: { width: N, height: N, channels: 4 } }).png().toFile(`shared/assets/patterns/${id}.png`);
  console.log(`✓ ${id}: ${Math.round((on / (N * N)) * 100)} % cubierto`);
}
