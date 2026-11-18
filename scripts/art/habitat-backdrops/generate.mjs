// Fondos pintados de las salas del hábitat (modo híbrido) con Nano Banana (API de Gemini): un
// panorama por sala que se ve detrás de la sala isométrica. El cielo se pinta de un color clave
// (#FF00FF) que `import.mjs` vuelve transparente: detrás va el cielo vivo de la escena (hora real,
// sol, luna, estrellas, nubes y clima), así el paisaje nunca lleva una hora horneada.
//
//   node scripts/art/habitat-backdrops/generate.mjs <sala|jardin|santuario|citafinal> [--ref <img>] [--model …] [--ratio 16:9]
//        → sprite-previews/habitat-backdrops/<sala>.<ext>   (pasarla por import.mjs y revisarla)
//
// Cada llamada genera UNA imagen y se cobra. La clave NO va en el repo: variable GEMINI_API_KEY o
// .env.local en la raíz (ignorado por git) con una línea GEMINI_API_KEY=…
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/** `.env.local` de aquí, el de la copia principal del repo y el de los demás worktrees. */
function envFiles() {
  const files = ['.env.local'];
  try {
    const common = execSync('git rev-parse --path-format=absolute --git-common-dir', { encoding: 'utf8' }).trim();
    files.push(path.join(path.dirname(common), '.env.local'));
    const list = execSync('git worktree list --porcelain', { encoding: 'utf8' });
    for (const m of list.matchAll(/^worktree (.+)$/gm)) files.push(path.join(m[1].trim(), '.env.local'));
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

/** Lo que se ve alrededor de cada sala. */
const ROOMS = {
  jardin: `The countryside around a cozy cottage garden: rolling green meadows with wildflowers, a few round
leafy trees and bushes clustered at the far LEFT and far RIGHT edges, a wooden windmill or a little stone
well on one side, a soft line of blue-green forested hills and a distant mountain range along the horizon.`,
  sala: `The outskirts of a tiny cozy fantasy village seen from a hill: a few small cottages with warm
coloured roofs and chimneys clustered at the far LEFT and far RIGHT edges, an orchard tree or two, a winding
dirt road, patchwork fields and soft hills fading into the distance along the horizon.`,
  santuario: `A serene mountain temple landscape: misty layered mountain peaks along the horizon, a small
pagoda and a red torii gate on a cliff at the far LEFT, blossoming cherry trees and pine trees at the far
RIGHT, low bands of white mist between the mountain layers, a calm lake in the middle distance.`,
  citafinal: `A dreamlike celestial realm: small floating rock islands with tiny waterfalls and glowing
crystals drift at the far LEFT and far RIGHT, a sea of soft clouds below the horizon, distant floating
spires. Magical, quiet and grand.`,
};

const room = args[0];
if (!ROOMS[room] || args.includes('--list')) {
  console.error(`Uso: generate.mjs <${Object.keys(ROOMS).join('|')}> [--ref <imagen>]`);
  process.exit(2);
}

const prompt = `Pixel art game background for a cute virtual-pet game (style: low-poly pixel art, big chunky pixels,
simple angular shapes, flat shading with three tones per material, around 24 colours, no dithering noise,
no fine texture, crisp edges). A small isometric room will be drawn ON TOP of the centre of this picture later.

Scene: ${ROOMS[room]}

Composition rules (very important):
- Wide side-view panorama, camera slightly above the ground. Horizon line at about 50% of the image height.
- The SKY must be ONE perfectly flat solid colour: pure magenta #FF00FF (RGB 255,0,255). No gradient, no sun,
  no moon, no stars, no clouds, no birds, no glow, no haze in the sky. The real sky is added by the game.
- Never use magenta, pink-purple or violet anywhere else in the picture (no pink flowers, no purple roofs).
- Everything that stands up (trees, buildings, rocks) has a clean hard silhouette against the magenta sky.
- The CENTRE of the picture will be covered by the room: keep the centre simple (open ground, distant hills).
  Put the interesting landmarks at the far left and far right thirds.
- The lower half is simple open ground that continues to the bottom edge, with no foreground objects.
- Neutral, even daylight lighting with no strong time of day (the game tints it for dawn, dusk and night).
- No creatures, no people, no animals, no text, no logos, no UI, no frame or border.
${args.includes('--ref') ? '- The reference image shows the art style to match.' : ''}`;

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const headers = { 'x-goog-api-key': apiKey(), 'Content-Type': 'application/json', 'Api-Revision': '2026-05-20' };
const ref = opt('ref');
const mime = (f) => (/\.jpe?g$/i.test(f) ? 'image/jpeg' : /\.webp$/i.test(f) ? 'image/webp' : 'image/png');
const body = {
  model: opt('model', 'gemini-nano-banana-2.1'),
  input: [
    { type: 'text', text: prompt },
    ...(ref ? [{ type: 'image', mime_type: mime(ref), data: fs.readFileSync(ref).toString('base64') }] : []),
  ],
  response_format: { type: 'image', aspect_ratio: opt('ratio', '16:9'), image_size: opt('size', '1K') },
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
const outDir = path.join('sprite-previews', 'habitat-backdrops');
fs.mkdirSync(outDir, { recursive: true });
if (!img) {
  fs.writeFileSync(path.join(outDir, `${room}.respuesta.json`), JSON.stringify(json, null, 2).slice(0, 20000));
  console.error('La respuesta no trae imagen; guardada la respuesta en', outDir);
  process.exit(1);
}
const ext = /jpe?g/.test(img.mime_type ?? img.mimeType ?? '') ? 'jpg' : 'png';
const out = path.join(outDir, `${room}.${ext}`);
fs.writeFileSync(out, Buffer.from(img.data, 'base64'));
console.log('✓', out, '· 1 imagen generada');
