// Fondos del hábitat del Nexo con Nano Banana (API de Gemini): un diorama por nivel, siempre del
// mismo lugar, que se va transformando con la Resonancia del clan.
//
//   node scripts/art/clan-habitat/generate.mjs <nivel 1-5> [--ref <nivel-anterior.png>] [--model …] [--ratio 4:3]
//        → sprite-previews/clan-habitat/tier-<n>.<ext>   (revisar antes de copiarlo a shared/assets/clan-habitat/)
//   node scripts/art/clan-habitat/generate.mjs --list      modelos de imagen disponibles con la clave
//
// Cada llamada genera UNA imagen y se cobra. Empieza por el nivel 1, enséñaselo al usuario y pasa
// la imagen aprobada como --ref al siguiente: así el lugar es el mismo y solo crece.
//
// La clave NO va en el repo ni en la línea de comandos: variable GEMINI_API_KEY o .env.local en la
// raíz (ignorado por git) con una línea GEMINI_API_KEY=…
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/** `.env.local` de aquí y, si esto es un worktree, el de la copia principal del repo. */
function envFiles() {
  const files = ['.env.local'];
  try {
    const common = execSync('git rev-parse --path-format=absolute --git-common-dir', { encoding: 'utf8' }).trim();
    files.push(path.join(path.dirname(common), '.env.local'));
  } catch {
    /* fuera de git: solo el de aquí */
  }
  return files;
}

function apiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  for (const file of envFiles()) {
    if (!fs.existsSync(file)) continue;
    const m = fs.readFileSync(file, 'utf8').match(/^\s*GEMINI_API_KEY\s*=\s*"?([^"\r\n]+)"?\s*$/m);
    if (m) return m[1].trim();
  }
  console.error('Falta la clave: define GEMINI_API_KEY o crea .env.local con GEMINI_API_KEY=…');
  process.exit(2);
}

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
};
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const headers = { 'x-goog-api-key': apiKey(), 'Content-Type': 'application/json', 'Api-Revision': '2026-05-20' };

if (args.includes('--list')) {
  const r = await fetch(`${BASE}/models?pageSize=200`, { headers });
  const j = await r.json();
  if (!r.ok) {
    console.error(r.status, JSON.stringify(j).slice(0, 400));
    process.exit(1);
  }
  for (const m of j.models ?? [])
    if (/image|banana/i.test(m.name + (m.displayName ?? ''))) console.log(m.name.replace('models/', ''), '—', m.displayName ?? '');
  process.exit(0);
}

const level = Number(args[0]);
if (!(level >= 1 && level <= 5)) {
  console.error('Uso: generate.mjs <nivel 1-5> [--ref <imagen>]');
  process.exit(2);
}

/** Lo que tiene el lugar en cada nivel. Cada nivel conserva lo anterior y lo mejora. */
const TIERS = {
  1: `"Claro de las Hebras" (level 1, a clan that has just been founded). A small, humble forest clearing at dusk:
soft grass, a few rocks, two or three young trees at the edges, a narrow path. Faint glowing threads of light
float in the grass like fireflies. Cozy but modest: almost nothing has been built yet.`,
  2: `"Campamento del Eco" (level 2). The SAME clearing, now a lively camp at golden hour: two tents (one orange,
one purple), a central campfire with warm light, wooden posts with colourful pennant banners, crates and a
small notice board. More glowing threads in the air.`,
  3: `"Santuario de los Juramentos" (level 3). The SAME place, now a sanctuary at twilight: the camp has grown into
a stone plaza with a ring of carved rune stones that glow cyan, a small shrine arch at the back, lanterns,
flower beds and a shallow reflecting pool. Magic motes rise from the runes.`,
  4: `"Ciudadela del Nexo" (level 4). The SAME place, now a small fantasy citadel at night: crystal towers of
glowing blue aether stand behind the plaza, bridges and banners, the rune ring is now inlaid in polished stone,
beams of light rise into the sky. Grand and protective, but still cute and cozy.`,
  5: `"Nexo Celestial" (level 5, the legendary maximum). The SAME place, now floating among the stars: the citadel
rests on a floating island with waterfalls falling into clouds, a huge violet aether core shines above the
central tower, a big aurora fills the night sky, constellations and shooting stars. Epic and awe-inspiring.`,
};

const prompt = `Pixel art game background for a cute virtual-pet game (style: low-poly pixel art, big chunky pixels,
simple angular shapes, flat shading with three tones per material, around 24 colours, no dithering noise,
no fine texture, crisp edges). It is the home of a clan of small creatures.

Scene: ${TIERS[level]}

Composition rules (very important):
- Side view diorama, wide panorama, camera at the creatures' eye level.
- The LOWER 40% of the image must be open, flat, walkable ground (grass / stone plaza) with NOTHING standing
  on it: no characters, no props in the middle. Small creatures will be drawn walking there later.
- The UPPER 35% is mostly sky: a UI panel will cover the top, so keep important details in the middle band.
- Props and buildings sit at the far left, far right and in the background, framing the empty ground.
- No creatures, no people, no animals, no text, no logos, no UI, no frame or border.
${args.includes('--ref') ? '- The reference image is the previous level of this SAME place: keep the same layout, horizon line, ground shape and camera, and upgrade it as described. It must clearly look like the same location, grown more magnificent.' : ''}`;

const ref = opt('ref');
const mime = (f) => (/\.jpe?g$/i.test(f) ? 'image/jpeg' : /\.webp$/i.test(f) ? 'image/webp' : 'image/png');
const body = {
  model: opt('model', 'gemini-nano-banana-2.1'),
  input: [
    { type: 'text', text: prompt },
    ...(ref ? [{ type: 'image', mime_type: mime(ref), data: fs.readFileSync(ref).toString('base64') }] : []),
  ],
  response_format: { type: 'image', aspect_ratio: opt('ratio', '4:3'), image_size: opt('size', '1K') },
};

const res = await fetch(`${BASE}/interactions`, { method: 'POST', headers, body: JSON.stringify(body) });
const json = await res.json();
if (!res.ok) {
  console.error(res.status, JSON.stringify(json).slice(0, 600));
  process.exit(1);
}

/** La imagen puede venir en varios sitios según la versión de la API: se busca el primer bloque de imagen. */
function findImage(node) {
  if (!node || typeof node !== 'object') return null;
  if (typeof node.data === 'string' && node.data.length > 500 && (node.type === 'image' || node.mime_type || node.mimeType)) return node;
  for (const v of Object.values(node)) {
    const hit = findImage(v);
    if (hit) return hit;
  }
  return null;
}
const img = findImage(json);
const outDir = path.join('sprite-previews', 'clan-habitat');
fs.mkdirSync(outDir, { recursive: true });
if (!img) {
  fs.writeFileSync(path.join(outDir, `tier-${level}.respuesta.json`), JSON.stringify(json, null, 2).slice(0, 20000));
  console.error('La respuesta no trae imagen; guardada la respuesta en', outDir);
  process.exit(1);
}
const ext = /jpe?g/.test(img.mime_type ?? img.mimeType ?? '') ? 'jpg' : 'png';
const out = path.join(outDir, `tier-${level}.${ext}`);
fs.writeFileSync(out, Buffer.from(img.data, 'base64'));
console.log('✓', out, '· 1 imagen generada');
