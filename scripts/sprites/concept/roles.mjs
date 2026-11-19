// Convierte las cuatro etapas importadas de una especie en datos del generador: cada color de la
// hoja pasa a ser un papel de color (primario, secundario, acento) con su tono, o un color literal.
//   node scripts/sprites/concept/roles.mjs <id>
// Escribe scripts/sprites/pixel/imported/<id>.json y propone la paleta por defecto de la especie.
//
// Los colores se agrupan en tres familias por parecido real (k-medias en Lab), no por tono
// dominante: así valen igual una especie azul, una crema con crin naranja o una dorada con alas cian.
// La familia con más píxeles es el primario; la segunda, el secundario; la tercera, el acento.
import fs from 'fs';

const id = process.argv[2];
const STAGES = ['baby', 'juvenile', 'adult', 'final'];
const N = 64;

function lab([r, g, b]) {
  const f = (v) => { v /= 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92; };
  const [R, G, B] = [f(r), f(g), f(b)];
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const t = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  return [116 * t(y) - 16, 500 * (t(x) - t(y)), 200 * (t(y) - t(z))];
}
const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const hex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
// Espacio de agrupación: la luminosidad pesa menos que el color, para que luz y sombra de un mismo
// material caigan en la misma familia.
const key = (c) => { const [L, a, b] = lab(c); return [L * 0.45, a, b]; };
const d3 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

const data = STAGES.map((st) => JSON.parse(fs.readFileSync(`sprite-previews/nano/${id}-${st}-64.json`, 'utf8')));
const colors = [];
data.forEach((d, si) => {
  const count = new Array(d.palette.length).fill(0);
  d.frames.forEach((f) => f.forEach((ci) => { if (ci >= 0) count[ci]++; }));
  d.palette.forEach((c, ci) => colors.push({ si, ci, c, n: count[ci], lab: lab(c), k: key(c) }));
});
const total = colors.reduce((a, c) => a + c.n, 0);

// Contorno: el color más oscuro de cada etapa y todo lo casi negro.
for (let si = 0; si < data.length; si++) {
  const dark = colors.filter((c) => c.si === si && c.n > 0).sort((a, b) => a.lab[0] - b.lab[0])[0];
  if (dark) dark.family = 'line';
}
for (const c of colors) if (c.lab[0] < 13) c.family = 'line';

// Tres familias por k-medias ponderado. Arranque determinista: el color con más peso y, después,
// el más lejano de los ya elegidos (ponderado por su peso).
const pool = colors.filter((c) => !c.family && c.n > total * 0.003);
const centers = [pool.slice().sort((a, b) => b.n - a.n)[0].k.slice()];
while (centers.length < 3) {
  let best = null;
  for (const c of pool) {
    const d = Math.min(...centers.map((m) => d3(c.k, m))) * Math.sqrt(c.n);
    if (!best || d > best.d) best = { d, k: c.k };
  }
  centers.push(best.k.slice());
}
for (let it = 0; it < 30; it++) {
  const sum = centers.map(() => [0, 0, 0, 0]);
  for (const c of pool) {
    let bi = 0;
    centers.forEach((m, i) => { if (d3(c.k, m) < d3(c.k, centers[bi])) bi = i; });
    for (let j = 0; j < 3; j++) sum[bi][j] += c.k[j] * c.n;
    sum[bi][3] += c.n;
  }
  centers.forEach((m, i) => { if (sum[i][3]) for (let j = 0; j < 3; j++) m[j] = sum[i][j] / sum[i][3]; });
}
const group = (c) => { let bi = 0; centers.forEach((m, i) => { if (d3(c.k, m) < d3(c.k, centers[bi])) bi = i; }); return bi; };
const weight = centers.map(() => 0);
for (const c of pool) weight[group(c)] += c.n;
const order = centers.map((_, i) => i).sort((a, b) => weight[b] - weight[a]);
const FAMILY = ['primary', 'secondary', 'accent'];
const familyOf = (gi) => FAMILY[order.indexOf(gi)];

for (const c of colors) {
  if (c.family) continue;
  const gi = group(c);
  const far = d3(c.k, centers[gi]);
  // Literal: brillos blancos pequeños y colores escasos que no se parecen a ninguna familia
  // (boca, comida, chispas).
  const white = c.lab[0] > 93 && Math.hypot(c.lab[1], c.lab[2]) < 8 && c.n < total * 0.02;
  c.family = white || (c.n < total * 0.012 && far > 34) ? 'lit' : familyOf(gi);
}

// Color de paleta de cada familia: el más claro de los que pesan, llevado al tono base (gris 239).
const anchor = (family, fallback) => {
  const fam = colors.filter((c) => c.family === family);
  const w = fam.reduce((a, c) => a + c.n, 0);
  const heavy = fam.filter((c) => c.n >= w * 0.1);
  if (!heavy.length) return fallback;
  const best = heavy.sort((a, b) => lum(b.c) - lum(a.c))[0].c;
  return best.map((v) => Math.min(255, (v * 255) / 239));
};
const primary = anchor('primary', [120, 120, 200]);
const secondary = anchor('secondary', primary.map((v) => Math.min(255, v * 1.2)));
const accent = anchor('accent', primary.map((v) => v * 0.42));
const BASE = { primary, secondary, accent };

// Tono: el gris del generador que deja la luminancia más cerca de la del color original.
const MAX_DRIFT = Number(process.env.MAX_DRIFT) || 30;
const TONES = {
  primary: [['body', 'base', 239], ['body', 'shade', 172], ['body', 'deep', 124], ['mark', 'deep', 96]],
  secondary: [['belly', 'base', 239], ['belly', 'shade', 200], ['trait', 'shade', 172], ['belly', 'deep', 160], ['trait', 'deep', 124]],
  accent: [['accent', 'base', 239], ['accent', 'shade', 172], ['accent', 'deep', 124]],
};
function entry(c) {
  if (c.family === 'lit') return { lit: c.c.map(Math.round) };
  if (c.family === 'line') return { role: 'skin', tone: 'line' };
  const target = lum(c.c);
  const ref = lum(BASE[c.family]);
  let best = null;
  for (const [role, tone, g] of TONES[c.family]) {
    const d = Math.abs((ref * g) / 255 - target);
    if (!best || d < best.d) best = { role, tone, d, g };
  }
  // Si el papel elegido dejaría el color irreconocible (una llama naranja en una familia crema
  // saldría parda), se guarda literal: pierde la paleta por mascota, pero conserva el dibujo.
  const shown = lab(BASE[c.family].map((v) => (v * best.g) / 255));
  if (d3(shown, c.lab) > MAX_DRIFT) { c.family = 'lit'; return { lit: c.c.map(Math.round) }; }
  return { role: best.role, tone: best.tone };
}

const CH = (i) => String.fromCharCode(48 + i);
const stages = {};
data.forEach((d, si) => {
  const legend = d.palette.map((_, ci) => entry(colors.find((c) => c.si === si && c.ci === ci)));
  stages[STAGES[si]] = { legend, frames: d.frames.map((f) => f.map((ci) => (ci < 0 ? '.' : CH(ci))).join('')) };
});
fs.mkdirSync('scripts/sprites/pixel/imported', { recursive: true });
fs.writeFileSync(`scripts/sprites/pixel/imported/${id}.json`, JSON.stringify({ id, n: N, stages }) + '\n');

const fam = (f) => Math.round((colors.filter((c) => c.family === f).reduce((a, c) => a + c.n, 0) / total) * 100);
console.log(`reparto: primario ${fam('primary')} %, secundario ${fam('secondary')} %, acento ${fam('accent')} %, línea ${fam('line')} %, literal ${fam('lit')} %`);
console.log(`paleta propuesta: primary ${hex(primary)} secondary ${hex(secondary)} accent ${hex(accent)}`);
fs.writeFileSync(`sprite-previews/nano/${id}-paleta.json`, JSON.stringify({ primary: hex(primary), secondary: hex(secondary), accent: hex(accent) }));
