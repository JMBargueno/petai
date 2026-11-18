// Convierte las cuatro etapas importadas de una especie en datos del generador: cada color de la
// hoja pasa a ser un papel de color (primario, secundario, acento) con su tono, o un color literal.
//   node scripts/sprites/concept/roles.mjs <id>
// Escribe scripts/sprites/pixel/imported/<id>.json y propone la paleta por defecto de la especie.
import fs from 'fs';

const id = process.argv[2];
const STAGES = ['baby', 'juvenile', 'adult', 'final'];
const N = 64;

function hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60 : max === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60;
  return [h, s, l];
}
const hueDist = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const hex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

const data = STAGES.map((st) => JSON.parse(fs.readFileSync(`sprite-previews/nano/${id}-${st}-64.json`, 'utf8')));
// Peso de cada color (píxeles que ocupa) en toda la especie.
const colors = [];
data.forEach((d, si) => {
  const count = new Array(d.palette.length).fill(0);
  d.frames.forEach((f) => f.forEach((ci) => { if (ci >= 0) count[ci]++; }));
  d.palette.forEach((c, ci) => colors.push({ si, ci, c, n: count[ci], hsl: hsl(c) }));
});
const total = colors.reduce((a, c) => a + c.n, 0);

// Tonos de la especie: el primario es el tono dominante entre los colores saturados; el secundario,
// el segundo grupo de tono (a más de 18° del primario) con más peso.
const sat = colors.filter((c) => c.hsl[1] > 0.3 && c.hsl[2] > 0.2 && c.hsl[2] < 0.9);
const bins = new Array(36).fill(0);
sat.forEach((c) => { bins[Math.floor(c.hsl[0] / 10) % 36] += c.n; });
const peak = (skipHue) => {
  let best = -1;
  bins.forEach((n, i) => { if ((skipHue === undefined || hueDist(i * 10 + 5, skipHue) > 18) && (best < 0 || n > bins[best])) best = i; });
  return best * 10 + 5;
};
const meanHue = (around) => {
  let x = 0;
  let y = 0;
  sat.forEach((c) => { if (hueDist(c.hsl[0], around) <= 12) { x += Math.cos((c.hsl[0] * Math.PI) / 180) * c.n; y += Math.sin((c.hsl[0] * Math.PI) / 180) * c.n; } });
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};
const priHue = meanHue(peak());
const secHue = meanHue(peak(priHue));

// Familia de cada color.
for (const c of colors) {
  const [h, s, l] = c.hsl;
  const dp = hueDist(h, priHue);
  const ds = hueDist(h, secHue);
  if (s < 0.16 && l > 0.7) c.family = 'lit'; // brillos blancos
  else if (s > 0.3 && Math.min(dp, ds) > 45) c.family = 'lit'; // boca, comida, chispas: fuera de la paleta
  else if (l < 0.11) c.family = 'line';
  else if (l < 0.27) c.family = 'accent'; // oscuros: caparazón, cuernos, sombras profundas // oscuros apagados: caparazón, cuernos
  else if (ds < dp && l > 0.42) c.family = 'secondary';
  else c.family = 'primary';
}

// El color más oscuro de cada etapa es siempre el contorno, aunque la paleta corta lo haya aclarado.
for (let si = 0; si < data.length; si++) {
  const dark = colors.filter((c) => c.si === si && c.family !== 'lit' && c.n > 0).sort((a, b) => a.hsl[2] - b.hsl[2])[0];
  if (dark) dark.family = 'line';
}

// Color de paleta de cada familia: su color claro con más peso, llevado al tono base (gris 239).
const anchor = (family, fallback) => {
  const fam = colors.filter((c) => c.family === family && c.n > total * 0.004);
  if (!fam.length) return fallback;
  const top = [...fam].sort((a, b) => lum(b.c) - lum(a.c)).slice(0, Math.max(1, Math.ceil(fam.length / 3)));
  const best = top.sort((a, b) => b.n - a.n)[0].c;
  return best.map((v) => Math.min(255, (v * 255) / 239));
};
const primary = anchor('primary', [80, 120, 220]);
const secondary = anchor('secondary', primary.map((v) => Math.min(255, v * 1.3)));
const accent = anchor('accent', primary.map((v) => v * 0.42));

// Tono: el gris del generador que deja la luminancia más cerca de la del color original.
const TONES = {
  primary: [['body', 'base', 239], ['body', 'shade', 172], ['body', 'deep', 124], ['mark', 'base', 128], ['mark', 'deep', 96]],
  secondary: [['belly', 'base', 239], ['belly', 'shade', 200], ['trait', 'shade', 172], ['belly', 'deep', 160], ['trait', 'deep', 124]],
  accent: [['accent', 'base', 239], ['accent', 'shade', 172], ['accent', 'deep', 124]],
};
const BASE = { primary, secondary, accent };
function entry(c) {
  if (c.family === 'lit') return { lit: c.c.map(Math.round) };
  if (c.family === 'line') return { role: 'skin', tone: 'line' };
  const target = lum(c.c);
  const ref = lum(BASE[c.family]);
  // Más claro que el tono base del primario: es luz (el generador la saca sumando secundario).
  if (c.family === 'primary' && target > ref * 0.99) return { role: 'body', tone: 'light' };
  let best = null;
  for (const [role, tone, g] of TONES[c.family]) {
    const d = Math.abs((ref * g) / 255 - target);
    if (!best || d < best.d) best = { role, tone, d };
  }
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
console.log(`tonos: primario ${priHue.toFixed(0)}°, secundario ${secHue.toFixed(0)}°`);
console.log(`reparto: primario ${fam('primary')} %, secundario ${fam('secondary')} %, acento ${fam('accent')} %, línea ${fam('line')} %, literal ${fam('lit')} %`);
console.log(`paleta propuesta: primary ${hex(primary)} secondary ${hex(secondary)} accent ${hex(accent)}`);
fs.writeFileSync(`sprite-previews/nano/${id}-paleta.json`, JSON.stringify({ primary: hex(primary), secondary: hex(secondary), accent: hex(accent) }));
