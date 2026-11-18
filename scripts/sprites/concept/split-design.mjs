// Parte una hoja de diseño (las cuatro etapas de una especie en fila) en una imagen por etapa, para
// usarlas como referencia de diseño al generar el arte final.
//   node scripts/sprites/concept/split-design.mjs <id> <hoja-de-diseño>
// Escribe sprite-previews/nano/<id>-<etapa>-diseno.png. Las criaturas se localizan por su mancha
// conexa: las cuatro mayores, de izquierda a derecha, son cría, juvenil, adulta y final.
import sharp from 'sharp';

const [id, file] = process.argv.slice(2);
const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const px = (i) => [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

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

const label = new Int32Array(W * H);
const comps = [];
for (let i = 0; i < W * H; i++) {
  if (isBg[i] || label[i]) continue;
  const c = { n: 0, x0: W, y0: H, x1: 0, y1: 0 };
  const st = [i];
  label[i] = comps.length + 1;
  while (st.length) {
    const j = st.pop();
    c.n++;
    const x = j % W;
    const y = (j / W) | 0;
    if (x < c.x0) c.x0 = x;
    if (x > c.x1) c.x1 = x;
    if (y < c.y0) c.y0 = y;
    if (y > c.y1) c.y1 = y;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const k = yy * W + xx;
      if (!isBg[k] && !label[k]) { label[k] = comps.length + 1; st.push(k); }
    }
  }
  comps.push(c);
}
const four = comps.sort((a, b) => b.n - a.n).slice(0, 4).sort((a, b) => a.x0 - b.x0);
if (four.length < 4) throw new Error(`${id}: solo se han encontrado ${four.length} criaturas`);
const NAMES = ['baby', 'juvenile', 'adult', 'final'];
for (let i = 0; i < 4; i++) {
  const c = four[i];
  const m = Math.round(Math.max(c.x1 - c.x0, c.y1 - c.y0) * 0.12);
  const left = Math.max(0, c.x0 - m);
  const top = Math.max(0, c.y0 - m);
  const width = Math.min(W - left, c.x1 - c.x0 + 1 + m * 2);
  const height = Math.min(H - top, c.y1 - c.y0 + 1 + m * 2);
  await sharp(file).extract({ left, top, width, height }).flatten({ background: { r: bg[0], g: bg[1], b: bg[2] } }).png().toFile(`sprite-previews/nano/${id}-${NAMES[i]}-diseno.png`);
}
console.log(`✓ ${id}: ${four.map((c) => `${c.x1 - c.x0 + 1}×${c.y1 - c.y0 + 1}`).join(' ')}`);
