// Importa una lámina de Nano Banana con uno o varios objetos (consumibles) a iconos de pixel art
// nativo, con sus COLORES reales (no por roles: un objeto no se tiñe por mascota).
//
//   node scripts/sprites/items/import.mjs <lámina> --ids <id>[,<id>…]
//        [--pick 0,2] [--colors 12] [--fit 28] [--size 32] [--no-outline] [--crop x,y,w,h]
//        [--out shared/assets/items] [--preview <png>]
//
// La lámina trae los objetos en fila sobre magenta #ff00ff. Cada objeto se localiza como mancha
// conexa (lo que comparte columna se funde con él: un rabito suelto, un destello pegado), su paleta
// se reduce a --colors tonos y cada píxel nativo toma el color mayoritario de su celda. El lado
// mayor del objeto mide --fit px nativos y va centrado en un lienzo de --size, que se guarda a ×2
// en <out>/<id>.png. Misma técnica que scripts/sprites/effects/import.mjs.
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { encodePng } from '../../lib/png.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const file = args[0];
const ids = (opt('ids') ?? '').split(',').filter(Boolean);
if (!file || file.startsWith('--') || ids.length === 0) {
  console.error('Uso: node scripts/sprites/items/import.mjs <lámina> --ids <id>[,<id>…] [--pick …] [--colors 12] [--fit 28] [--size 32] [--no-outline] [--crop x,y,w,h] [--out dir] [--preview png]');
  process.exit(2);
}
const SIZE = Number(opt('size', 32));
const FIT = Number(opt('fit', SIZE - 4));
const K = Number(opt('colors', 12));
const OUTLINE = !args.includes('--no-outline');
const OUT = opt('out', 'shared/assets/items');
const SCALE = 2;
if (FIT > SIZE - 2) { console.error(`--fit ${FIT} no deja 1 px de margen en un lienzo de ${SIZE}`); process.exit(2); }

const foods = JSON.parse(fs.readFileSync('shared/game-data/foods.json', 'utf8'));
for (const id of ids) if (!foods.some((f) => f.id === id)) { console.error(`'${id}' no existe en shared/game-data/foods.json`); process.exit(2); }

const crop = opt('crop')?.split(',').map(Number);
let img = sharp(file).removeAlpha();
if (crop) img = img.extract({ left: crop[0], top: crop[1], width: crop[2], height: crop[3] });
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const px = (i) => [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

// Fondo: lo que se parece al color de la esquina y todo magenta o rosa (la IA a veces mancha el
// borde con rosa): rojo y azul altos, verde bajo. Por eso un objeto no puede llevar rosa.
const bg = px(3 * W + 3);
const isBg = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) {
  const c = px(i);
  if (dist2(c, bg) < 90 * 90 || (c[0] > 170 && c[2] > 170 && c[1] < 150)) isBg[i] = 1;
}

// Manchas conexas
const label = new Int32Array(W * H);
const comps = [];
for (let i = 0; i < W * H; i++) {
  if (isBg[i] || label[i]) continue;
  const id = comps.length + 1;
  let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0;
  const st = [i];
  label[i] = id;
  while (st.length) {
    const j = st.pop();
    const x = j % W, y = (j / W) | 0;
    n++;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    for (const k of [j + 1, j - 1, j + W, j - W]) {
      if (k < 0 || k >= W * H || isBg[k] || label[k]) continue;
      if (Math.abs((k % W) - x) > 1) continue;
      label[k] = id;
      st.push(k);
    }
  }
  comps.push({ id, x0, y0, x1, y1, n });
}
if (comps.length === 0) { console.error('La lámina no tiene nada sobre el fondo: ¿es magenta liso?'); process.exit(1); }

// Piezas: de mayor a menor, cada mancha se funde con la pieza con la que comparte columna o, si es
// bastante grande, empieza una pieza nueva. Las motas sueltas se ignoran.
const maxN = Math.max(...comps.map((c) => c.n));
let pieces = [];
for (const c of [...comps].sort((a, b) => b.n - a.n)) {
  if (c.n < maxN * 0.002) break;
  const host = pieces.find((p) => Math.min(c.x1, p.x1) - Math.max(c.x0, p.x0) > Math.min(c.x1 - c.x0, p.x1 - p.x0) * 0.3);
  if (host) {
    host.ids.add(c.id);
    host.x0 = Math.min(host.x0, c.x0); host.x1 = Math.max(host.x1, c.x1);
    host.y0 = Math.min(host.y0, c.y0); host.y1 = Math.max(host.y1, c.y1);
  } else if (c.n >= maxN * 0.15) pieces.push({ ...c, ids: new Set([c.id]) });
}
// Orden de lectura: filas (por base) y, dentro, de izquierda a derecha
const rowH = Math.max(...pieces.map((p) => p.y1 - p.y0)) * 0.5;
pieces.sort((a, b) => (Math.abs(a.y1 - b.y1) < rowH ? a.x0 - b.x0 : a.y1 - b.y1));
const found = pieces.length;
if (opt('pick')) pieces = opt('pick').split(',').map((i) => pieces[Number(i)]);
if (pieces.length !== ids.length || pieces.some((p) => !p)) {
  console.error(`La lámina tiene ${found} objetos y --ids pide ${ids.length}. Usa --pick para elegir cuáles (0 = el primero por la izquierda) o --crop.`);
  process.exit(1);
}

/** Reduce los colores de una pieza a K (k-medias determinista: empieza por el más oscuro y va al más lejano). */
function palette(p) {
  const pts = [];
  const step = Math.max(1, Math.floor(Math.sqrt(((p.x1 - p.x0 + 1) * (p.y1 - p.y0 + 1)) / 40000)));
  for (let y = p.y0; y <= p.y1; y += step) for (let x = p.x0; x <= p.x1; x += step) {
    const i = y * W + x;
    if (!isBg[i] && p.ids.has(label[i])) pts.push(px(i));
  }
  const cents = [pts.reduce((a, c) => (lum(c) < lum(a) ? c : a))];
  const near = new Float64Array(pts.length).fill(Infinity);
  while (cents.length < K) {
    let far = -1, fd = 0;
    pts.forEach((c, i) => { near[i] = Math.min(near[i], dist2(c, cents[cents.length - 1])); if (near[i] > fd) { fd = near[i]; far = i; } });
    if (far < 0 || fd < 12 * 12) break; // ya no quedan colores distintos
    cents.push(pts[far]);
  }
  for (let it = 0; it < 12; it++) {
    const sum = cents.map(() => [0, 0, 0, 0]);
    for (const c of pts) {
      let b = 0, bd = Infinity;
      cents.forEach((k, j) => { const d = dist2(c, k); if (d < bd) { bd = d; b = j; } });
      sum[b][0] += c[0]; sum[b][1] += c[1]; sum[b][2] += c[2]; sum[b][3]++;
    }
    sum.forEach((s, j) => { if (s[3]) cents[j] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
  }
  return cents.map((c) => c.map(Math.round));
}

function toIcon(p) {
  const pal = palette(p);
  const STEP = Math.max(p.x1 - p.x0 + 1, p.y1 - p.y0 + 1) / FIT;
  const gw = Math.max(1, Math.round((p.x1 - p.x0 + 1) / STEP));
  const gh = Math.max(1, Math.round((p.y1 - p.y0 + 1) / STEP));
  const sx = (p.x1 - p.x0 + 1) / gw, sy = (p.y1 - p.y0 + 1) / gh;
  const cells = new Int16Array(SIZE * SIZE).fill(-1);
  const ox = Math.floor((SIZE - gw) / 2), oy = Math.floor((SIZE - gh) / 2);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const votes = new Array(pal.length + 1).fill(0);
    for (let v = 0.1; v < 1; v += 0.2) for (let u = 0.1; u < 1; u += 0.2) {
      const x = Math.min(p.x1, Math.floor(p.x0 + (gx + u) * sx)), y = Math.min(p.y1, Math.floor(p.y0 + (gy + v) * sy));
      const i = y * W + x;
      if (isBg[i] || !p.ids.has(label[i])) { votes[0]++; continue; }
      const c = px(i);
      let b = 0, bd = Infinity;
      pal.forEach((k, j) => { const d = dist2(c, k); if (d < bd) { bd = d; b = j; } });
      votes[b + 1]++;
    }
    // El fondo solo gana si es clara mayoría: los bordes de 1 px no se pierden
    const total = votes.reduce((a, b) => a + b, 0);
    if (votes[0] >= total * 0.6) continue;
    let win = 1;
    for (let k = 2; k < votes.length; k++) if (votes[k] > votes[win]) win = k;
    cells[(oy + gy) * SIZE + ox + gx] = win - 1;
  }
  // Silueta limpia: todo píxel del objeto que toca el vacío y no es ya un oscuro pasa a contorno.
  // Cada pieza conserva SU contorno teñido (el de la hoja no es el de la fruta): el píxel toma el
  // oscuro que más se repite entre sus vecinos y, si no tiene ninguno, el más parecido a su color.
  if (OUTLINE) {
    const minLum = Math.min(...pal.map(lum));
    const isDark = pal.map((c) => lum(c) <= minLum + 22); // el contorno de cada pieza, no su sombra
    const at = (x, y) => (x < 0 || y < 0 || x >= SIZE || y >= SIZE ? -1 : cells[y * SIZE + x]);
    const fixes = [];
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const c = at(x, y);
      if (c < 0 || isDark[c] || ![at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)].includes(-1)) continue;
      const count = new Map();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const n = at(x + dx, y + dy);
        if (n >= 0 && isDark[n]) count.set(n, (count.get(n) ?? 0) + 1);
      }
      let pick = -1;
      if (count.size) pick = [...count].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
      else {
        const target = pal[c].map((v) => v * 0.3);
        let bd = Infinity;
        pal.forEach((k, j) => { if (!isDark[j]) return; const d = dist2(k, target); if (d < bd) { bd = d; pick = j; } });
      }
      if (pick >= 0) fixes.push([y * SIZE + x, pick]);
    }
    for (const [i, c] of fixes) cells[i] = c;
  }
  const used = [...new Set(cells)].filter((c) => c >= 0);
  return { cells, pal, colors: used.length, w: gw, h: gh };
}

function rgba(icon, k, bgColor) {
  const out = new Uint8Array(SIZE * k * SIZE * k * 4);
  for (let y = 0; y < SIZE * k; y++) for (let x = 0; x < SIZE * k; x++) {
    const c = icon.cells[Math.floor(y / k) * SIZE + Math.floor(x / k)];
    const o = (y * SIZE * k + x) * 4;
    const col = c >= 0 ? icon.pal[c] : bgColor;
    if (col) { out[o] = col[0]; out[o + 1] = col[1]; out[o + 2] = col[2]; out[o + 3] = 255; }
  }
  return out;
}

fs.mkdirSync(OUT, { recursive: true });
const icons = pieces.map(toIcon);
icons.forEach((icon, n) => {
  const dst = path.join(OUT, `${ids[n]}.png`);
  fs.writeFileSync(dst, encodePng(SIZE * SCALE, SIZE * SCALE, rgba(icon, SCALE, null)));
  console.log(`✓ ${dst}  ${icon.w}×${icon.h} px nativos en ${SIZE}×${SIZE}, ${icon.colors} colores`);
});

// Vista previa ×8: cada icono sobre claro y sobre oscuro
const prev = opt('preview');
if (prev) {
  const S = 8, cell = SIZE * S;
  const PW = cell * 2, PH = cell * icons.length;
  const buf = new Uint8Array(PW * PH * 4);
  icons.forEach((icon, n) => [[242, 241, 248], [23, 22, 42]].forEach((bgc, side) => {
    const tile = rgba(icon, S, bgc);
    for (let y = 0; y < cell; y++) buf.set(tile.subarray(y * cell * 4, (y + 1) * cell * 4), ((n * cell + y) * PW + side * cell) * 4);
  }));
  fs.mkdirSync(path.dirname(prev), { recursive: true });
  fs.writeFileSync(prev, encodePng(PW, PH, buf));
  console.log('✓', prev);
}
