// Importa una lámina de Nano Banana de un efecto a frames por ROLES de color (no colores), para que
// el motor los tiña en tiempo real (Flujo, metal del cofre…).
//
//   node scripts/sprites/effects/import.mjs <lámina> <salida.json> --palette <roles.json>
//        --width <px nativos> [--order 0,1,2,4,5] [--crop x,y,w,h] [--same-scale <i>] [--widths 8,13,13] [--preview <png>]
//
// <roles.json>: { "outline": "#101010", "woodDeep": "#5a3a22", … } — los colores EXACTOS que pidió el
// prompt. Cada píxel nativo toma el rol del color mayoritario de su celda (el fondo, inundado desde
// los bordes, no cuenta). Las piezas se localizan como manchas conexas, se ordenan por filas y
// columnas, y todas se reducen con la MISMA escala (la de la pieza más ancha → --width) y se apoyan
// abajo en la misma fila, así que el tamaño y el suelo no bailan entre frames.
import fs from 'fs';
import sharp from 'sharp';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const [file, out] = args;
const roles = JSON.parse(fs.readFileSync(opt('palette'), 'utf8'));
const ROLE_NAMES = Object.keys(roles);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const ROLE_RGB = ROLE_NAMES.map((r) => hex(roles[r]));
const TARGET_W = Number(opt('width', 28));

// --crop: solo una zona de la lámina (p. ej. la primera fila cuando la IA repite en dos)
const crop = opt('crop')?.split(',').map(Number);
let img = sharp(file).removeAlpha();
if (crop) img = img.extract({ left: crop[0], top: crop[1], width: crop[2], height: crop[3] });
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const px = (i) => [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Fondo: inundación desde los bordes con el color de la esquina; además, todo lo que se parezca
// al fondo (magenta) cuenta como fondo aunque esté encerrado.
const bg = px(3 * W + 3);
const isBg = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) {
  const c = px(i);
  // Magenta y rosas (la IA a veces mancha con rosa): rojo y azul altos, verde bajo
  if (dist(c, bg) < 90 || (c[0] > 170 && c[2] > 170 && c[1] < 150)) isBg[i] = 1;
}

// Manchas conexas grandes = piezas
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
// Piezas: de mayor a menor, cada mancha se funde con la pieza con la que comparte columna (la tapa
// del huevo, la tapa que flota sobre la caja, los destellos pegados) o, si es bastante grande,
// empieza una pieza nueva (el sello suelto). Las motas sueltas se ignoran.
const maxN = Math.max(...comps.map((c) => c.n));
const pieces0 = [];
for (const c of [...comps].sort((x, y) => y.n - x.n)) {
  if (c.n < maxN * 0.01) break;
  const host = pieces0.find((p) => Math.min(c.x1, p.x1) - Math.max(c.x0, p.x0) > Math.min(c.x1 - c.x0, p.x1 - p.x0) * 0.3);
  if (host) {
    host.ids.push(c.id);
    host.x0 = Math.min(host.x0, c.x0); host.x1 = Math.max(host.x1, c.x1);
    host.y0 = Math.min(host.y0, c.y0); host.y1 = Math.max(host.y1, c.y1);
  } else if (c.n >= maxN * 0.03) pieces0.push({ ...c, ids: [c.id] });
}
let pieces = pieces0;
// Orden de lectura: filas (por centro vertical) y, dentro, de izquierda a derecha
const rowH = Math.max(...pieces.map((p) => p.y1 - p.y0)) * 0.5;
pieces.sort((a, b) => (Math.abs(a.y1 - b.y1) < rowH ? a.x0 - b.x0 : a.y1 - b.y1));
const order = opt('order') ? opt('order').split(',').map(Number) : pieces.map((_, i) => i);
pieces = order.map((i) => pieces[i]);

// Escala por pieza: la anchura de su BASE (la fila más ancha de su mitad baja) mide --width nativos. La IA
// dibuja cada frame a un tamaño algo distinto; la base (el cuerpo apoyado) es lo que no cambia.
function baseWidth(p) {
  let best = 0;
  for (let y = Math.round((p.y0 + p.y1) / 2); y <= p.y1; y++) {
    let a = W, b = 0;
    for (let x = p.x0; x <= p.x1; x++) if (p.ids.includes(label[y * W + x])) { if (x < a) a = x; if (x > b) b = x; }
    best = Math.max(best, b - a + 1);
  }
  return best;
}
// --same-scale i: todas las piezas con la escala de la pieza i (cuando el tamaño SÍ cambia entre
// frames: un pergamino que se desenrolla, una caja y un sobre en la misma lámina…)
const sameIdx = opt('same-scale');
const SAME = sameIdx !== undefined ? baseWidth(pieces[Number(sameIdx)]) / TARGET_W : null;
const frames = pieces.map((p) => {
  // --widths: anchura de base propia por pieza (una mano pequeña junto a un portal mayor)
  const own = opt('widths')?.split(',').map(Number)[pieces.indexOf(p)];
  const STEP = own ? baseWidth(p) / own : (SAME ?? baseWidth(p) / TARGET_W);
  const fw = Math.ceil((p.x1 - p.x0 + 1) / STEP);
  const fh = Math.ceil((p.y1 - p.y0 + 1) / STEP);
  const rows = [];
  for (let gy = 0; gy < fh; gy++) {
    let row = '';
    for (let gx = 0; gx < fw; gx++) {
      // Celda anclada abajo-izquierda, para que el suelo caiga en la última fila
      const cx0 = p.x0 + gx * STEP, cy0 = p.y1 + 1 - (fh - gy) * STEP;
      const votes = new Array(ROLE_NAMES.length + 1).fill(0);
      for (let sy = 0.15; sy < 1; sy += 0.17) for (let sx = 0.15; sx < 1; sx += 0.17) {
        const x = Math.floor(cx0 + sx * STEP), y = Math.floor(cy0 + sy * STEP);
        if (x < p.x0 || x > p.x1 || y < p.y0 || y > p.y1) { votes[0]++; continue; }
        const i = y * W + x;
        if (isBg[i] || !p.ids.includes(label[i])) { votes[0]++; continue; }
        const c = px(i);
        let best = 0, bd = Infinity;
        ROLE_RGB.forEach((r, k) => { const d = dist(c, r); if (d < bd) { bd = d; best = k; } });
        votes[best + 1]++;
      }
      // El fondo solo gana si es clara mayoría: los bordes de 1 px no se pierden
      const total = votes.reduce((a, b) => a + b, 0);
      let win = 0;
      if (votes[0] < total * 0.6) { let m = -1; for (let k = 1; k < votes.length; k++) if (votes[k] > m) { m = votes[k]; win = k; } }
      row += win === 0 ? '.' : String.fromCharCode(96 + win); // a, b, c… = rol 1, 2, 3…
    }
    rows.push(row);
  }
  // Silueta limpia: todo píxel de la pieza que toca el vacío pasa a contorno (rol «outline»)
  const OUT = ROLE_NAMES.indexOf('outline');
  if (OUT < 0) return rows;
  const at = (x, y) => (y < 0 || y >= rows.length || x < 0 || x >= rows[y].length ? '.' : rows[y][x]);
  return rows.map((row, y) => [...row].map((ch, x) => (ch !== '.' && [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)].includes('.') ? String.fromCharCode(97 + OUT) : ch)).join(''));
});

fs.writeFileSync(out, JSON.stringify({ source: file.split(/[\/]/).pop(), roles: ROLE_NAMES, frames }, null, 1));
console.log(`✓ ${frames.length} frames → ${out}`, frames.map((f) => `${f[0].length}×${f.length}`).join(' '));

// Vista previa ×6 en los colores originales del prompt
const prev = opt('preview');
if (prev) {
  const S = 6, G = 4;
  const fw = Math.max(...frames.map((f) => f[0].length)), fh = Math.max(...frames.map((f) => f.length));
  const PW = frames.length * (fw + G) * S, PH = (fh + G) * S;
  const buf = Buffer.alloc(PW * PH * 3, 200);
  frames.forEach((f, n) => f.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    const c = ROLE_RGB[ch.charCodeAt(0) - 97];
    const ox = (n * (fw + G) + x) * S, oy = (fh - f.length + y + G / 2) * S;
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) c.forEach((v, k) => (buf[((oy + dy) * PW + ox + dx) * 3 + k] = v));
  })));
  await sharp(buf, { raw: { width: PW, height: PH, channels: 3 } }).png().toFile(prev);
  console.log('✓', prev);
}
