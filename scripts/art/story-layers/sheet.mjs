// Hoja de contactos de los escenarios por capas: monta cada localización y cada pantalla apilando
// sus 4 capas pintadas (shared/assets/story-layers) sobre un cielo de día y otro de noche, para
// revisar de un vistazo que las combinaciones casan. Las capas sin pintar se dejan en hueco y se
// listan: en el juego se verían con su silueta procedural.
//
//   node scripts/art/story-layers/sheet.mjs   → sprite-previews/story-layers/contact.png
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const catalog = JSON.parse(fs.readFileSync(path.resolve('shared/game-data/story-locations.json'), 'utf8'));
const dir = path.resolve('shared/assets/story-layers');
const W = 448;
const H = 252;
const GAP = 8;
const SLOTS = ['bg', 'l1', 'l2', 'l3'];

const scenes = [
  ...catalog.locations.map((l) => ({ id: l.id, layers: l.layers })),
  ...Object.entries(catalog.screens).map(([id, s]) => ({ id: `pantalla-${id}`, layers: s.layers })),
];

const cache = new Map();
async function layerPng(id) {
  if (cache.has(id)) return cache.get(id);
  const file = path.join(dir, `${id}.webp`);
  const png = fs.existsSync(file) ? await sharp(file).resize(W, H, { fit: 'cover', position: 'bottom' }).png().toBuffer() : null;
  cache.set(id, png);
  return png;
}

const sky = (top, bottom) =>
  sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/></svg>`,
    ),
  )
    .png()
    .toBuffer();
const veil = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 27, g: 24, b: 70, alpha: 0.42 } } }).png().toBuffer();
const DAY = await sky('#6fbcff', '#c8e8ff');
const NIGHT = await sky('#0b1030', '#1d2356');

const missing = new Set();
const tiles = [];
for (const scene of scenes) {
  const stack = [];
  for (const slot of SLOTS) {
    const png = await layerPng(scene.layers[slot]);
    if (png) stack.push({ input: png });
    else missing.add(scene.layers[slot]);
  }
  const label = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="22"><rect width="${W}" height="22" fill="#0b0a14" fill-opacity="0.7"/><text x="6" y="15" font-family="monospace" font-size="12" fill="#ffffff">${scene.id}</text></svg>`,
  );
  const day = await sharp(DAY).composite([...stack, { input: label, top: 0, left: 0 }]).png().toBuffer();
  const night = await sharp(NIGHT).composite([...stack, { input: veil }]).png().toBuffer();
  tiles.push([day, night]);
}

const out = path.join('sprite-previews', 'story-layers');
fs.mkdirSync(out, { recursive: true });
await sharp({ create: { width: GAP + (W + GAP) * 2, height: GAP + (H + GAP) * tiles.length, channels: 4, background: '#15141f' } })
  .composite(
    tiles.flatMap(([day, night], i) => [
      { input: day, left: GAP, top: GAP + i * (H + GAP) },
      { input: night, left: GAP + W + GAP, top: GAP + i * (H + GAP) },
    ]),
  )
  .png()
  .toFile(path.join(out, 'contact.png'));

const total = catalog.layers.length;
console.log(`✓ ${path.join(out, 'contact.png')} · ${scenes.length} escenarios (día | noche) · ${total - missing.size}/${total} capas pintadas`);
if (missing.size) console.log(`  Sin pintar: ${[...missing].join(', ')}`);
