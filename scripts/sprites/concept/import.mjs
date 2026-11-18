// Importa una hoja de Nano Banana (10 sprites de una etapa, 2 filas × 5) a frames nativos de 64×64.
//   node scripts/sprites/concept/import.mjs <nombre> <imagen> [colores] [px de celda en la imagen]
// Los sprites se localizan por su mancha conexa (no por una rejilla fija), así que da igual que la
// IA los desplace. Todos se reducen con la misma escala y se apoyan en el suelo (fila 59).
import fs from 'fs';
import sharp from 'sharp';

const [name, file, kArg, cellArg] = process.argv.slice(2);
const K = Number(kArg) || 24;
const N = 64;
const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
// La hoja base mide 1600 px de ancho con celdas de 256: la celda escala con el ancho de la salida.
// El cuarto argumento es el px de celda o, con «h=NN», la altura nativa que debe medir la pose de reposo.
let CELL = Number(cellArg) || (W * 256) / 1600;
let STEP = CELL / N; // px de imagen por píxel nativo
const px = (i) => [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Fondo: se inunda desde los bordes.
const bg = px(3 * W + 3);
const isBg = new Uint8Array(W * H);
const stack = [];
const push = (x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = y * W + x;
  if (isBg[i] || dist(px(i), bg) > 30) return;
  isBg[i] = 1;
  stack.push(i);
};
for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
while (stack.length) { const i = stack.pop(); const x = i % W; const y = (i / W) | 0; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }

// Manchas conexas: las 10 mayores son las criaturas; el resto, partículas.
const label = new Int32Array(W * H);
const comps = [];
for (let i = 0; i < W * H; i++) {
  if (isBg[i] || label[i]) continue;
  const l = comps.length + 1;
  const c = { l, n: 0, x0: W, y0: H, x1: 0, y1: 0 };
  const st = [i];
  label[i] = l;
  while (st.length) {
    const j = st.pop();
    c.n++;
    const x = j % W;
    const y = (j / W) | 0;
    if (x < c.x0) c.x0 = x;
    if (x > c.x1) c.x1 = x;
    if (y < c.y0) c.y0 = y;
    if (y > c.y1) c.y1 = y;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const k = yy * W + xx;
      if (!isBg[k] && !label[k]) { label[k] = l; st.push(k); }
    }
  }
  comps.push(c);
}
const sprites = comps.sort((a, b) => b.n - a.n).slice(0, 10);
const midY = (Math.min(...sprites.map((s) => s.y0)) + Math.max(...sprites.map((s) => s.y1))) / 2;
sprites.sort((a, b) => ((a.y0 + a.y1) / 2 < midY ? 0 : 1) - ((b.y0 + b.y1) / 2 < midY ? 0 : 1) || a.x0 - b.x0);

if (String(cellArg).startsWith('h=')) {
  STEP = (sprites[0].y1 - sprites[0].y0 + 1) / Number(String(cellArg).slice(2));
  CELL = STEP * N;
}

/** Reduce una criatura a 64×64: centrada en x y apoyada en la fila 59; color más repetido de cada bloque. */
function downscale(s) {
  const out = new Array(N * N).fill(null);
  const cx = (s.x0 + s.x1) / 2;
  const left = cx - 32 * STEP;
  const top = s.y1 + 1 - 60 * STEP;
  for (let ny = 0; ny < N; ny++) for (let nx = 0; nx < N; nx++) {
    const xa = Math.floor(left + nx * STEP);
    const xb = Math.floor(left + (nx + 1) * STEP);
    const ya = Math.floor(top + ny * STEP);
    const yb = Math.floor(top + (ny + 1) * STEP);
    let total = 0;
    let inside = 0;
    const bins = new Map();
    for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
      total++;
      if (x < 0 || y < 0 || x >= W || y >= H || label[y * W + x] !== s.l) continue;
      inside++;
      const c = px(y * W + x);
      const key = ((c[0] >> 4) << 8) | ((c[1] >> 4) << 4) | (c[2] >> 4);
      const b = bins.get(key) ?? { n: 0, s: [0, 0, 0] };
      b.n++; b.s[0] += c[0]; b.s[1] += c[1]; b.s[2] += c[2];
      bins.set(key, b);
    }
    if (!total || inside * 2 < total) continue;
    let best = null;
    for (const b of bins.values()) if (!best || b.n > best.n) best = b;
    out[ny * N + nx] = best.s.map((v) => v / best.n);
  }
  return out;
}
const frames = sprites.map(downscale);

// Partículas pegadas: una mancha grande amarilla o naranja tocando a la criatura es una estrella de
// impacto o un destello que dibujó la IA. El juego pone las suyas, así que se quitan. Las pequeñas
// (ojos de estrella) se quedan. Solo se hace si ese color es raro en la especie: en una criatura
// dorada, crema o de fuego, el amarillo es su cuerpo, no una partícula.
const isFx = (c) => {
  const mx = Math.max(...c);
  const mn = Math.min(...c);
  if (mx - mn < 90 || mx < 150) return false;
  const h = mx === c[0] ? (((c[1] - c[2]) / (mx - mn)) * 60 + 360) % 360 : 999;
  return h >= 12 && h <= 68;
};
let removed = 0;
const opaque = frames.flat().filter(Boolean);
const fxShare = opaque.filter(isFx).length / Math.max(1, opaque.length);
for (const f of fxShare > 0.04 ? [] : frames) {
  const seen = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) {
    if (seen[i] || !f[i] || !isFx(f[i])) continue;
    const region = [];
    const st = [i];
    seen[i] = 1;
    while (st.length) {
      const j = st.pop();
      region.push(j);
      const x = j % N;
      const y = (j / N) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
        const k = yy * N + xx;
        if (!seen[k] && f[k] && isFx(f[k])) { seen[k] = 1; st.push(k); }
      }
    }
    if (region.length > 14) { region.forEach((j) => { f[j] = null; }); removed += region.length; }
  }
}
if (removed) console.log('partículas pegadas quitadas:', removed, 'px');

// Paleta corta común (k-medias, arranque determinista por luminancia).
const all = frames.flat().filter(Boolean).sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
let centers = Array.from({ length: K }, (_, i) => all[Math.floor(((i + 0.5) * all.length) / K)].slice());
for (let it = 0; it < 24; it++) {
  const sum = centers.map(() => [0, 0, 0, 0]);
  for (const c of all) {
    let bi = 0;
    let bd = 1e9;
    centers.forEach((m, i) => { const d = dist(c, m); if (d < bd) { bd = d; bi = i; } });
    sum[bi][0] += c[0]; sum[bi][1] += c[1]; sum[bi][2] += c[2]; sum[bi][3]++;
  }
  centers = centers.map((m, i) => (sum[i][3] ? [sum[i][0] / sum[i][3], sum[i][1] / sum[i][3], sum[i][2] / sum[i][3]] : m));
}
const nearest = (c) => { let bi = 0; let bd = 1e9; centers.forEach((m, i) => { const d = dist(c, m); if (d < bd) { bd = d; bi = i; } }); return bi; };
const indexed = frames.map((f) => f.map((c) => (c ? nearest(c) : -1)));

// Limpieza de ruido, en dos pasadas:
//  - silueta: se quitan píxeles sueltos y se rellenan agujeros de 1 px;
//  - color: un píxel sin ningún vecino de su color se funde con su entorno si se le parece
//    (ruido dentro de un material). Los que contrastan (brillos, ojos) se respetan.
const NB8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
let cleaned = 0;
for (const f of indexed) {
  for (let pass = 0; pass < 2; pass++) {
    const src = f.slice();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const count = new Map();
      let opaque = 0;
      let same4 = 0;
      NB8.forEach(([dx, dy], k) => {
        const xx = x + dx;
        const yy = y + dy;
        const v = xx < 0 || yy < 0 || xx >= N || yy >= N ? -1 : src[yy * N + xx];
        if (v < 0) return;
        opaque++;
        count.set(v, (count.get(v) ?? 0) + 1);
        if (k < 4 && v === src[i]) same4++;
      });
      const major = [...count.entries()].sort((p, q) => q[1] - p[1])[0];
      if (src[i] < 0) {
        if (opaque >= 7) { f[i] = major[0]; cleaned++; }
        continue;
      }
      if (opaque <= 1) { f[i] = -1; cleaned++; continue; }
      if (same4 === 0 && major && major[1] >= 4 && dist(centers[src[i]], centers[major[0]]) < 70) { f[i] = major[0]; cleaned++; }
    }
  }
}
console.log('limpieza:', cleaned, 'px');

// Vista previa: 5 × 2 a ×4, y debajo la misma fila a tamaño real (×1).
const S = 4;
const PW = 5 * N * S;
const PH = 2 * N * S + N + 16;
const out = Buffer.alloc(PW * PH * 3);
for (let i = 0; i < PW * PH; i++) { out[i * 3] = 242; out[i * 3 + 1] = 241; out[i * 3 + 2] = 248; }
const put = (x, y, c) => { const o = (y * PW + x) * 3; out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; };
indexed.forEach((f, k) => {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const ci = f[y * N + x];
    if (ci < 0) continue;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) put((k % 5) * N * S + x * S + i, Math.floor(k / 5) * N * S + y * S + j, centers[ci]);
    put(8 + k * (N + 8) + x, 2 * N * S + 8 + y, centers[ci]);
  }
});
await sharp(out, { raw: { width: PW, height: PH, channels: 3 } }).png().toFile(`sprite-previews/nano/${name}-64.png`);
fs.writeFileSync(`sprite-previews/nano/${name}-64.json`, JSON.stringify({ name, n: N, palette: centers.map((c) => c.map(Math.round)), frames: indexed }));
const hs = sprites.map((s) => Math.round((s.y1 - s.y0 + 1) / STEP));
console.log(`${name}: ${W}×${H}, celda ${CELL.toFixed(0)} px, alturas nativas ${hs.join(' ')} → sprite-previews/nano/${name}-64.png`);
