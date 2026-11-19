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
  'bg-mar-de-datos': 'A calm distant sea of data seen from the shore: wide horizontal bands of glowing teal and deep blue waves stretching to a flat horizon, faint cyan sparkles and thin lines of light on the wave crests.',
  'bg-arbol-raiz': 'A colossal ancient world-tree far away on the horizon, centred, its trunk and canopy made of braided dark green cables and glowing teal leaves, its huge roots spreading over low dark green hills to both sides.',
  'bg-tormenta-voltaica': 'A distant flat dark blue plateau with a row of tall thin metal lightning rods along the horizon, frozen jagged bolts of pale yellow and cyan electricity arcing between their tips. No clouds.',
  'bg-dunas-silicio': 'Distant rolling desert dunes of pale golden-beige silicon sand fading with distance, a few tiny glinting square chips half buried on the slopes catching the light.',
  'bg-glaciar-cache': 'A distant glacier and snowy faceted mountains in pale ice blue and white, the ice made of big geometric crystal blocks like stacked cache cubes, faint cyan glow inside the ice.',
  'bg-ciudad-servidores': 'A distant city skyline of tall rectangular server towers in deep navy and steel blue, covered in rows of tiny cyan and warm yellow indicator lights, a few thin antennas. Low contrast, far away.',
  'bg-islas-flotantes': 'Several small rocky islands floating at different heights in the distance, each with a thin waterfall of glowing pale cyan light pouring off its edge down into a misty blue-green band at the bottom.',
  'bg-cordillera-prisma': 'A far mountain range made of huge translucent prism crystals, pale gold and soft cyan facets refracting light, smooth angular peaks fading with distance.',
  'bg-archivo-olvidado': 'Distant ruins of an enormous ancient archive on low hills: broken stone arches, tall half-collapsed walls with empty window frames and leaning towers, in cold grey-blue stone, a few faint cyan glints. Melancholic and far away.',
  'bg-fumarolas-termo': 'A distant volcanic industrial landscape: dark brown hills with wide squat cooling towers and vents glowing orange at their mouths, thin straight columns of pale warm steam rising only a little. Rust and amber tones.',
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
  'l1-arrecife-datos': 'A reef of luminous data coral in the middle distance spread across the width: branching coral formations in teal, aqua and warm orange with glowing cyan tips, a few round sea-fan shapes, on low dark blue rocky ground.',
  'l1-bosque-fractal': 'A forest of fractal trees in the middle distance spread across the width: each tree a dark trunk splitting into branches that split again and again into ever smaller branches, tipped with small glowing green leaves, on low dark green ground.',
  'l1-pilonos-voltaicos': 'A row of five tall SOLID tapering pylon towers in the middle distance spread across the width: chunky dark steel grey and teal obelisk-like towers with no lattice and no holes, each topped with a crossbar of glowing pale yellow insulators, and bright jagged cyan-white electric arcs jumping between neighbouring tops, on low dark ground. No purple or violet at all.',
  'l1-dunas-silicio': 'Rolling golden-beige sand dunes in the middle distance, with large green circuit-board fragments and square chips half buried in the sand at angles, their copper traces glinting.',
  'l1-ruinas-archivo': 'Ruins of an ancient archive in the middle distance spread across the width: three broken stone arches, toppled columns and fallen blocks in grey-blue stone, worn carved shelves in the walls, on low rubble ground. The ruins are LOW: their highest point reaches only 55% of the image height.',
  'l1-biblioteca-codices': 'A grand library building seen from the front, centred and wide, with its facade open like a doll house: tall warm wooden bookcases full of glowing books and scroll-like codices on several floors, ladders, a stone pediment roof with a round glowing window.',
  'l1-faro-nexo': 'A tall slender white and steel-blue lighthouse, centred, on a rocky base, its lantern room at the top shining a soft cyan beacon, a small keeper house beside it. Iconic and hopeful.',
  'l1-forja-termica': 'A sturdy forge building seen from the side, centred and wide: dark stone and iron walls, a big open front with a glowing orange furnace and an anvil inside, a tall chimney, metal pipes along the walls.',
  'l1-observatorio': 'An astronomical observatory, centred: a round stone building with a large silver-blue dome open in a slit, a big brass telescope pointing up out of it, small round windows glowing softly, standing on snowy ground.',
  'l1-invernadero': 'A Victorian-style glass greenhouse, centred and wide: a domed roof of glass panes in thin white-green metal frames, full of lush plants, glowing fruits and hanging vines inside, warm light in the glass.',
  // ---- l2: suelo. Una franja en el cuarto inferior; arriba todo croma.
  'l2-prado-hebras': 'A strip of ground: a dark green meadow whose grass blades are thin glowing threads, a flat walkable path along its top edge.',
  'l2-placas-datos': 'A strip of ground: a floor of large dark blue metallic data plates with faint glowing seams between them, flat and walkable.',
  'l2-piedra-runica': 'A strip of ground: old grey-blue stone slabs engraved with softly glowing runes, flat and walkable, slightly worn.',
  'l2-cristal-roto': 'A strip of ground: a cracked dark indigo crystal floor broken into shards with bright cyan light leaking through the cracks, flat enough to walk on.',
  'l2-roca-ignea': 'A strip of ground: dark cracked volcanic rock slabs with bright orange-red glowing cracks between them, flat and walkable.',
  'l2-tarima': 'A strip of ground: a warm polished wooden plank floor seen slightly from above, flat and walkable.',
  'l2-orilla-datos': 'A strip of ground: a smooth dark wet sandy shoreline, flat and walkable, with only a thin line of shallow glowing teal foam and small cyan sparkles running along its top edge. It is a LOW strip: no water surface or sea above it.',
  'l2-musgo-fractal': 'A strip of ground: a soft dark green moss carpet dotted with tiny branching fractal sprouts and little glowing green specks, flat and walkable.',
  'l2-rejilla-circuito': 'A strip of ground: a dark teal circuit board floor with thin glowing cyan traces, small square chips and solder dots, flat and walkable.',
  'l2-arena-silicio': 'A strip of ground: smooth packed golden-beige silicon sand with small ripples and a few tiny glinting chips, flat and walkable.',
  'l2-adoquin-nexo': 'A strip of ground: old rounded grey-blue cobblestones with tufts of dark grass between some of them, a few faintly glowing cyan stones, flat and walkable.',
  'l2-baldosa-mosaico': 'A strip of ground: a polished cream and warm brown marble mosaic floor with a simple geometric border pattern, flat and walkable, indoor.',
  'l2-puente-luz': 'A strip of ground: a bridge deck made of planks of solid pale cyan light with soft white edges and small gaps between the planks, flat and walkable.',
  'l2-ceniza-forja': 'A strip of ground: a LOW flat floor of dark iron grating seen slightly from above, with dull orange embers glowing through the holes and patches of grey ash on top. No wall, no fence, nothing standing up from it.',
  'l2-hielo-cache': 'A strip of ground: pale blue snow-dusted ice made of big square ice tiles with faint cyan glow in the seams, flat and walkable.',
  'l2-raices': 'A strip of ground: a path of thick woven brown roots tightly braided together, with small green leaves and moss in the gaps, flat and walkable.',
  // ---- l3: primer plano. Solo en los bordes; el centro, croma de arriba abajo.
  'l3-hebras-colgantes': 'Foreground framing: thick dark threads and strands hanging down from the top at the far LEFT and far RIGHT edges only, some ending in small glowing knots. Dark silhouettes, close to the camera.',
  'l3-cristales': 'Foreground framing: clusters of big dark indigo-blue crystals rising from the bottom at the far LEFT and far RIGHT corners only. Dark, close to the camera, with a thin cyan rim light.',
  'l3-estandartes': 'Foreground framing: two tall banner poles, one at the far LEFT edge and one at the far RIGHT edge, each with a long dark blue cloth banner bearing a simple glowing circle emblem, hanging towards the outside.',
  'l3-follaje': 'Foreground framing: dark round bushes and big leaves in the bottom LEFT and bottom RIGHT corners and a few leaves in the top corners only. Dark green silhouettes close to the camera.',
  'l3-cables': 'Foreground framing: a few thick dark cables hanging from the top at the far LEFT and far RIGHT edges only, with small glowing connector nodes. Dark silhouettes close to the camera.',
  'l3-coral': 'Foreground framing: big dark teal branching coral formations rising from the bottom at the far LEFT and far RIGHT corners only, a few tips glowing cyan. Dark silhouettes close to the camera.',
  'l3-ramas-fractales': 'Foreground framing: dark fractal tree branches reaching in from the top LEFT and top RIGHT corners only, splitting into ever smaller twigs with a few small glowing green leaves. Dark silhouettes close to the camera.',
  'l3-postes-voltaicos': 'Foreground framing: one dark wooden utility pole at the far LEFT edge and one at the far RIGHT edge, each with glowing pale yellow insulators near the top and a few cables drooping towards the outside.',
  'l3-aletas-silicio': 'Foreground framing: large dark square chips and broken circuit-board slabs stuck upright and tilted in sand at the bottom LEFT and bottom RIGHT corners only, with thin copper glints. Dark silhouettes close to the camera.',
  'l3-columnas-rotas': 'Foreground framing: one broken dark stone column at the far LEFT edge and a shorter broken one with fallen blocks at the far RIGHT edge, a little ivy on them. Dark silhouettes close to the camera.',
  'l3-pilas-codices': 'Foreground framing: tall leaning stacks of thick old books and codices in the bottom LEFT and bottom RIGHT corners only, a couple of pages softly glowing. Dark warm-brown silhouettes close to the camera.',
  'l3-faroles': 'Foreground framing: a few lanterns hanging on dark ropes from the top at the far LEFT and far RIGHT edges only, each lantern glowing soft warm yellow. Dark silhouettes close to the camera.',
  'l3-cadenas-forja': 'Foreground framing: heavy dark iron chains with big hooks hanging from the top at the far LEFT and far RIGHT edges only, a faint orange glow on the metal. Dark silhouettes close to the camera.',
  'l3-estalactitas-hielo': 'Foreground framing: long dark blue icicles hanging from the top at the far LEFT and far RIGHT edges only, and a few jagged ice shards rising from the bottom corners, thin cyan rim light.',
  'l3-helechos': 'Foreground framing: huge dark green fern fronds curling in from the bottom LEFT and bottom RIGHT corners and a few drooping from the top corners only. Dark silhouettes close to the camera.',
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
