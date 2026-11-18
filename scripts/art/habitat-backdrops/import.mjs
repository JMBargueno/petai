// Importa un fondo pintado de sala (o del Nexo) generado con el cielo en croma magenta: vuelve
// transparente el cielo y lo guarda como .webp con alfa, listo para ponerlo delante del cielo vivo.
//
//   node scripts/art/habitat-backdrops/import.mjs <entrada.png> <salida.webp> [--tol 120] [--width 1344]
//
// 1. Color clave: la media de los píxeles «magenta» de la fila de arriba (la IA casi nunca pinta
//    exactamente #FF00FF).
// 2. Relleno por inundación desde los bordes superior y laterales: solo se borra el cielo unido al
//    borde, así una flor rosa en mitad del prado no se agujerea.
// 3. Huecos de cielo entre ramas (no unidos al borde): solo si son casi exactamente el color clave.
// 4. Desfringe de 1 px: el borde de árboles y montes pierde el halo magenta.
// Además deja una vista previa sobre un cielo de día y otro de noche en sprite-previews/.
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const [input, output] = args;
if (!input || !output) {
  console.error('Uso: import.mjs <entrada.png> <salida.webp> [--tol 120] [--width 1344]');
  process.exit(2);
}
const TOL = opt('tol', 120);
const TIGHT = 46;

let img = sharp(input).ensureAlpha();
const targetW = opt('width', 0);
if (targetW) img = img.resize({ width: targetW, kernel: 'nearest' });
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const px = (i) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
/** Cuánto «magenta» tiene un color: rojo y azul por encima del verde. */
const magentaness = ([r, g, b]) => Math.min(r, b) - g;

// 1. Color clave
let sum = [0, 0, 0];
let n = 0;
for (let x = 0; x < W; x++) {
  const c = px(x);
  if (magentaness(c) > 90) {
    sum = sum.map((s, k) => s + c[k]);
    n++;
  }
}
if (n < W * 0.3) {
  console.error(`La fila de arriba no es cielo magenta (${n}/${W} píxeles): ¿la imagen trae el cielo en croma?`);
  process.exit(1);
}
const key = sum.map((s) => s / n);
const dist = (c) => Math.hypot(c[0] - key[0], c[1] - key[1], c[2] - key[2]);
const isSky = (c, tol) => dist(c) < tol || (magentaness(c) > 150 && dist(c) < tol * 1.6);

// 2. Inundación desde los bordes
const sky = new Uint8Array(W * H);
const stack = [];
const seed = (x, y) => {
  const i = y * W + x;
  if (!sky[i] && isSky(px(i), TOL)) {
    sky[i] = 1;
    stack.push(i);
  }
};
for (let x = 0; x < W; x++) seed(x, 0);
for (let y = 0; y < H; y++) {
  seed(0, y);
  seed(W - 1, y);
}
while (stack.length) {
  const i = stack.pop();
  const x = i % W;
  const y = (i - x) / W;
  if (x > 0) seed(x - 1, y);
  if (x < W - 1) seed(x + 1, y);
  if (y > 0) seed(x, y - 1);
  if (y < H - 1) seed(x, y + 1);
}
// 3. Huecos entre ramas, solo si son casi el color clave
let holes = 0;
for (let i = 0; i < W * H; i++) {
  if (!sky[i] && dist(px(i)) < TIGHT) {
    sky[i] = 1;
    holes++;
  }
}
// 4. Alfa y desfringe del borde: dos anillos (la compresión JPG de la IA corre el halo 2 px).
for (let i = 0; i < W * H; i++) if (sky[i]) data[i * 4 + 3] = 0;
let fringe = 0;
const ring = (mask) => {
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (mask[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    if ((x > 0 && mask[i - 1]) || (x < W - 1 && mask[i + 1]) || (y > 0 && mask[i - W]) || (y < H - 1 && mask[i + W])) out[i] = 1;
  }
  return out;
};
const ring1 = ring(sky);
const inner = sky.map((v, i) => v | ring1[i]);
const ring2 = ring(inner);
for (let i = 0; i < W * H; i++) {
  if (!ring1[i] && !ring2[i]) continue;
  const c = px(i);
  const m = magentaness(c);
  if (ring1[i] && m > 60) {
    data[i * 4 + 3] = 0;
    fringe++;
  } else if (m > -10) {
    // Quita el tinte magenta: rojo y azul bajan hasta un poco por debajo del verde.
    const k = m + 10;
    data[i * 4] = Math.max(0, c[0] - k);
    data[i * 4 + 2] = Math.max(0, c[2] - k);
    fringe++;
  }
}
// 5. Magenta neón que queda dentro del paisaje (flores, chispas que la IA pintó del color clave):
//    se pasa a un rosa suave para que no se vea como croma sin quitar.
let neon = 0;
for (let i = 0; i < W * H; i++) {
  if (data[i * 4 + 3] === 0) continue;
  const c = px(i);
  if (magentaness(c) > 110) {
    data[i * 4] = 236;
    data[i * 4 + 1] = 160;
    data[i * 4 + 2] = 200;
    neon++;
  }
}
const keyed = sky.reduce((a, b) => a + b, 0);
const rgba = { raw: { width: W, height: H, channels: 4 } };
fs.mkdirSync(path.dirname(output), { recursive: true });
await sharp(data, rgba).webp({ quality: 86, alphaQuality: 100, smartSubsample: true }).toFile(output);

// Vista previa: el paisaje sobre un cielo de día y uno de noche (con el velo de la noche encima)
const prevDir = path.join('sprite-previews', 'habitat-backdrops');
fs.mkdirSync(prevDir, { recursive: true });
const base = path.basename(output).replace(/\.\w+$/, '');
const layer = await sharp(data, rgba).png().toBuffer();
const solid = (hex, alpha = 1) =>
  sharp({ create: { width: W, height: H, channels: 4, background: { r: (hex >> 16) & 255, g: (hex >> 8) & 255, b: hex & 255, alpha } } })
    .png()
    .toBuffer();
const day = await sharp(await solid(0x9fd2ff)).composite([{ input: layer }]).png().toBuffer();
const night = await sharp(await solid(0x141a44))
  .composite([{ input: layer }, { input: await solid(0x1b1846, 0.42) }])
  .png()
  .toBuffer();
await sharp({ create: { width: W, height: H * 2, channels: 4, background: '#000' } })
  .composite([
    { input: day, top: 0, left: 0 },
    { input: night, top: H, left: 0 },
  ])
  .png()
  .toFile(path.join(prevDir, `${base}.preview.png`));

console.log(
  `✓ ${output} · ${W}×${H} · clave rgb(${key.map(Math.round).join(',')}) · cielo ${((keyed / (W * H)) * 100).toFixed(1)} %` +
    ` (huecos ${holes}, borde ${fringe}, neón ${neon}) · vista previa en ${prevDir}/${base}.preview.png`,
);
