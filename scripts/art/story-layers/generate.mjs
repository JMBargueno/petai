// Capas pintadas de los escenarios de la aventura diaria (y de los fondos de Arena, Raid, Torneo,
// Entrenamiento y Cocina) con Nano Banana (API de Gemini). Cada escenario son 4 capas combinables
// (shared/game-data/story-locations.json): bg, l1, l2 y l3. Todo lo que NO es la capa se pinta de un
// color clave (#FF00FF) que `import.mjs` vuelve transparente, para poder apilarlas sobre el cielo vivo.
//
//   node scripts/art/story-layers/generate.mjs <idDeCapa> [--ref <img>] [--model …]
//   node scripts/art/story-layers/generate.mjs --list            (capas y cuáles faltan por pintar)
//        → sprite-previews/story-layers/<idDeCapa>.<ext>   (pasarla por import.mjs y revisarla)
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

/**
 * Qué se ve en cada capa. El mundo es el Éter Digital: un paisaje de datos y luz, no un bosque
 * medieval. Ninguna capa usa magenta, rosa ni violeta (es el color clave): los tonos «de sombra»
 * van en índigo y azul noche con luces cian y blancas.
 */
const LAYERS = {
  // ---- bg: fondo lejano. Cielo en croma; el paisaje ocupa la franja del horizonte hacia abajo.
  'bg-eter-abisal': 'A vast dark digital abyss: far, faint floating islands and drifting server-like monoliths in deep navy and indigo, tiny cyan lights on them, long thin luminous data filaments crossing the distance. Very low contrast, mysterious, far away.',
  'bg-corrientes': 'Distant rivers of light: several wide glowing teal and blue streams of data winding across a dark plain towards the horizon, like aurora rivers seen from afar, with small bright nodes where they cross.',
  'bg-aurora': 'A far range of smooth dark teal hills under hanging curtains of aurora: the aurora ribbons are part of the landscape band just above the hills, in green, teal and pale gold.',
  'bg-crestas': 'A calm distant mountain range: three overlapping layers of soft blue-grey angular peaks fading with distance, a few tiny points of warm light on the slopes.',
  'bg-ascuas': 'A distant scorched volcanic range: tall dark red-brown angular mountains with thin bright orange lava seams, reaching high into the picture, the farthest peaks paler. No smoke, no haze columns, no clouds.',
  // ---- l1: plano medio. Relieve o edificio sobre una franja de suelo; el resto, croma.
  'l1-colinas-hebra': 'Gentle rolling teal-green hills in the middle distance, covered with thin upright glowing threads of light like luminous grass stalks, a few taller glowing strands swaying.',
  'l1-crestas-ascuas': 'Low scorched ridges in the middle distance: dark basalt and rust-red rock hills with glowing orange ember cracks and a few small lava pools, a couple of charred leafless stumps. The ridge is LOW: its highest point reaches only 55% of the image height, so the far background stays visible above it.',
  'l1-rotura': 'A huge jagged TEAR in reality standing in the middle distance, centred: a tall diamond-shaped rift whose inside is blinding white-cyan light, with cracked dark indigo crystalline edges, loose glowing threads hanging and fraying from its borders, shards floating around it. Dark broken rocky ground at its base.',
  'l1-nodos': 'A field of floating glowing orbs (data nodes) at different heights in the middle distance, each a blue sphere with a bright cyan core on a thin light stalk rising from dark low ground. About nine of them, spread across the whole width.',
  'l1-telar': 'Four tall ancient wooden weaving-loom frames standing in a row in the middle distance, spread across the width, strung with vertical glowing golden threads, warm brown wood with gold fittings, on low dark ground.',
  'l1-coliseo': 'A grand open-air colosseum seen from the side, centred and wide: tiered stone stands in dusty blue-grey with a row of arched entrances at ground level, two tall pillars topped with glowing crystals at each end. Monumental but friendly.',
  'l1-torres-cristal': 'A citadel of five tall translucent crystal towers, centred, the middle one tallest: pale ice-blue faceted spires with inner glow, joined by thin arcs of light, standing on a dark stone base.',
  'l1-santuario': 'A small abandoned shrine on a floating rock island, centred: four columns and a peaked roof in cold grey-blue stone, dusty, dark doorway, no lights on except one faint glow under the roof. Lonely and cold.',
  'l1-despensa': 'The front of a cozy pantry storehouse, centred and wide, with its wall open like a doll house: warm wooden shelves in three rows full of jars, baskets, glowing fruits and bottles, a simple peaked wooden roof.',
  'l1-dojo': 'A serene training hall seen from the side, centred and wide: low wooden building with a sweeping dark green tiled roof, paper sliding panels glowing softly from inside, sturdy dark wooden posts.',
  // ---- l2: suelo. Una franja en el cuarto inferior; arriba todo croma.
  'l2-prado-hebras': 'A strip of ground: a dark green meadow whose grass blades are thin glowing threads, a flat walkable path along its top edge.',
  'l2-placas-datos': 'A strip of ground: a floor of large dark blue metallic data plates with faint glowing seams between them, flat and walkable.',
  'l2-piedra-runica': 'A strip of ground: old grey-blue stone slabs engraved with softly glowing runes, flat and walkable, slightly worn.',
  'l2-cristal-roto': 'A strip of ground: a cracked dark indigo crystal floor broken into shards with bright cyan light leaking through the cracks, flat enough to walk on.',
  'l2-roca-ignea': 'A strip of ground: dark cracked volcanic rock slabs with bright orange-red glowing cracks between them, flat and walkable.',
  'l2-tarima': 'A strip of ground: a warm polished wooden plank floor seen slightly from above, flat and walkable.',
  // ---- l3: primer plano. Solo en los bordes; el centro, croma de arriba abajo.
  'l3-hebras-colgantes': 'Foreground framing: thick dark threads and strands hanging down from the top at the far LEFT and far RIGHT edges only, some ending in small glowing knots. Dark silhouettes, close to the camera.',
  'l3-cristales': 'Foreground framing: clusters of big dark indigo-blue crystals rising from the bottom at the far LEFT and far RIGHT corners only. Dark, close to the camera, with a thin cyan rim light.',
  'l3-estandartes': 'Foreground framing: two tall banner poles, one at the far LEFT edge and one at the far RIGHT edge, each with a long dark blue cloth banner bearing a simple glowing circle emblem, hanging towards the outside.',
  'l3-follaje': 'Foreground framing: dark round bushes and big leaves in the bottom LEFT and bottom RIGHT corners and a few leaves in the top corners only. Dark green silhouettes close to the camera.',
  'l3-cables': 'Foreground framing: a few thick dark cables hanging from the top at the far LEFT and far RIGHT edges only, with small glowing connector nodes. Dark silhouettes close to the camera.',
};

/** Reglas de composición de cada ranura (dónde va la capa y dónde el croma). */
const SLOT_RULES = {
  bg: `- This is the FARTHEST background layer. The landscape fills the picture from about 35% of the height down to the bottom edge, edge to edge, with no gaps.
- Everything above it (the SKY) is ONE perfectly flat solid colour: pure magenta #FF00FF. No gradient, no sun, no moon, no stars, no clouds.
- Low contrast and slightly hazy: it must read as far away.`,
  l1: `- This is the MIDDLE-distance layer. Its subject stands on a low band of ground that runs edge to edge and reaches the bottom edge of the picture.
- The ground line (where the subject stands) is at about 74% of the image height.
- Everything that is not the subject or its ground is ONE perfectly flat solid colour: pure magenta #FF00FF, including all the sky above and between the shapes.
- Clean hard silhouette against the magenta.`,
  l2: `- This is the GROUND layer where a character will walk. It is a horizontal strip filling ONLY the bottom 26% of the picture, edge to edge, with a clean, almost straight top edge at 74% of the image height.
- The top 74% of the picture is ONE perfectly flat solid colour: pure magenta #FF00FF. Nothing sticks up into it.
- No objects, no characters: just the walkable surface.`,
  l3: `- This is the FOREGROUND framing layer, very close to the camera.
- Its shapes touch ONLY the far left 15% and far right 15% of the picture. The whole central 70% of the picture, from the top edge to the bottom edge, is ONE perfectly flat solid colour: pure magenta #FF00FF.
- Everything else that is not a foreground shape is also pure magenta #FF00FF.
- Dark, simple, slightly out-of-focus-looking silhouettes with clean hard edges.`,
};

const catalog = JSON.parse(fs.readFileSync(path.resolve('shared/game-data/story-locations.json'), 'utf8'));
const slotOf = new Map(catalog.layers.map((l) => [l.id, l.slot]));
const paintedDir = path.resolve('shared/assets/story-layers');

if (args.includes('--list')) {
  for (const l of catalog.layers) {
    const done = fs.existsSync(path.join(paintedDir, `${l.id}.webp`));
    console.log(`${done ? '✓' : '·'} ${l.slot}  ${l.id}${LAYERS[l.id] ? '' : '   (sin descripción en generate.mjs)'}`);
  }
  process.exit(0);
}

const id = args[0];
if (!id || !LAYERS[id] || !slotOf.has(id)) {
  console.error(`Uso: generate.mjs <idDeCapa> [--ref <imagen>]   (--list para ver las capas)`);
  process.exit(2);
}
const slot = slotOf.get(id);

const prompt = `Pixel art game background LAYER for a cute virtual-pet game set in a luminous digital spirit world (style: low-poly pixel art, big chunky pixels, simple angular shapes, flat shading with three tones per material, around 24 colours, no dithering noise, no fine texture, crisp edges). This picture is ONE transparent layer of a 4-layer side-scrolling parallax scene: the game stacks it with other layers, so only this layer's content may be drawn.

Layer content: ${LAYERS[id]}

Composition rules (very important):
- Wide side view, camera at ground level looking straight ahead (NOT isometric, NOT top-down).
${SLOT_RULES[slot]}
- The solid magenta #FF00FF (RGB 255,0,255) is a chroma key: it must be perfectly flat and uniform, with no shading, no glow and no haze bleeding into it.
- Never use magenta, pink, purple or violet anywhere in the artwork itself.
- Neutral, even lighting with no strong time of day (the game tints it for dawn, dusk and night).
- No creatures, no people, no animals, no text, no logos, no UI, no frame or border.
${args.includes('--ref') ? '- The reference image shows the art style and palette family to match (ignore its composition).' : ''}`;

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
const outDir = path.join('sprite-previews', 'story-layers');
fs.mkdirSync(outDir, { recursive: true });
if (!img) {
  fs.writeFileSync(path.join(outDir, `${id}.respuesta.json`), JSON.stringify(json, null, 2).slice(0, 20000));
  console.error('La respuesta no trae imagen; guardada la respuesta en', outDir);
  process.exit(1);
}
const ext = /jpe?g/.test(img.mime_type ?? img.mimeType ?? '') ? 'jpg' : 'png';
const out = path.join(outDir, `${id}.${ext}`);
fs.writeFileSync(out, Buffer.from(img.data, 'base64'));
console.log('✓', out, '· 1 imagen generada');
