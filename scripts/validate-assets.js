// Script de validación automatizada de assets para CI (GitHub Actions)
const fs = require('fs');
const path = require('path');

console.log('=== Validando Pipeline de Assets (shared/assets/) ===');

const rootDir = path.resolve(__dirname, '..');
const sharedAssetsDir = path.join(rootDir, 'shared', 'assets');
const sharedGameDataDir = path.join(rootDir, 'shared', 'game-data');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`❌ Error al leer/parsear JSON en ${filePath}: ${err.message}`);
    process.exit(1);
  }
}

// Helper para leer dimensiones IHDR de un archivo PNG
function readPngDimensions(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(24);
  fs.readSync(fd, buffer, 0, 24, 0);
  fs.closeSync(fd);

  // Verificar firma PNG (89 50 4E 47 0D 0A 1A 0A)
  if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) {
    throw new Error(`Archivo no es un PNG válido: ${filePath}`);
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

let criticalErrors = 0;
let warnings = 0;

// 1. Validar palettes.json
const palettesPath = path.join(sharedAssetsDir, 'palettes.json');
if (!fs.existsSync(palettesPath)) {
  console.error('❌ CRÍTICO: Falta shared/assets/palettes.json');
  criticalErrors++;
} else {
  const palettes = readJson(palettesPath);
  const requiredElements = ['fire', 'water', 'plant', 'electric', 'shadow', 'light'];
  for (const el of requiredElements) {
    if (!palettes[el] || !palettes[el].default || !palettes[el].shiny) {
      console.error(`❌ CRÍTICO: palettes.json no define "default" y "shiny" para el elemento "${el}"`);
      criticalErrors++;
    }
  }
  console.log('✓ palettes.json: Estructura de paletas válida para todos los elementos');
}

// 2. Validar Patrones
const patternsData = readJson(path.join(sharedGameDataDir, 'patterns.json'));
const patternsDir = path.join(sharedAssetsDir, 'patterns');

for (const pattern of patternsData) {
  if (pattern.id === 'plain') continue; // Liso no requiere textura
  const patFile = path.join(patternsDir, `${pattern.id}.png`);
  if (!fs.existsSync(patFile)) {
    console.error(`❌ CRÍTICO: Falta la textura del patrón "${pattern.id}" en shared/assets/patterns/${pattern.id}.png`);
    criticalErrors++;
  } else {
    try {
      const dim = readPngDimensions(patFile);
      if (dim.width !== 256 || dim.height !== 256) {
        console.error(`❌ CRÍTICO: El patrón ${pattern.id}.png debe ser 256x256 px. Dimensiones actuales: ${dim.width}x${dim.height}`);
        criticalErrors++;
      }
    } catch (err) {
      console.error(`❌ CRÍTICO: ${err.message}`);
      criticalErrors++;
    }
  }
}
console.log(`✓ patterns/: Texturas validadas (${patternsData.filter(p => p.id !== 'plain').length} patrones)`);

// 3. Validar Especies (species.json)
const speciesData = readJson(path.join(sharedGameDataDir, 'species.json'));
const speciesDir = path.join(sharedAssetsDir, 'species');

const CRITICAL_TAGS = ['idle', 'walk', 'eat', 'happy', 'sleep', 'attack'];
const RECOMMENDED_TAGS = {
  idle_alt: 'idle',
  sad: 'idle',
  sick: 'idle',
  hungry: 'idle',
  tired: 'idle',
  clean: 'happy',
  talk: 'happy',
  drag: 'idle',
  fall: 'idle',
  land: 'idle',
  hit: 'idle',
  victory: 'happy',
  defeat: 'sad',
  level_up: 'happy',
  evolution: 'happy'
};

// Hojas por etapa (GUIA_ARTISTICA §7.4): adult vive en la raíz; baby/juvenile/final en subcarpetas.
const STAGE_DIRS = ['baby', 'juvenile', 'final'];

function validateSheet(label, dir) {
  const basePath = path.join(dir, 'base.png');
  const maskPath = path.join(dir, 'mask.png');
  const animPath = path.join(dir, 'anim.json');

  if (!fs.existsSync(basePath)) {
    console.error(`❌ CRÍTICO: Falta base.png en species/${label}/`);
    criticalErrors++;
  }
  if (!fs.existsSync(maskPath)) {
    console.error(`❌ CRÍTICO: Falta mask.png en species/${label}/`);
    criticalErrors++;
  }
  if (!fs.existsSync(animPath)) {
    console.error(`❌ CRÍTICO: Falta anim.json en species/${label}/`);
    criticalErrors++;
    return;
  }

  // Comprobar dimensiones idénticas
  if (fs.existsSync(basePath) && fs.existsSync(maskPath)) {
    try {
      const baseDim = readPngDimensions(basePath);
      const maskDim = readPngDimensions(maskPath);

      if (baseDim.width !== maskDim.width || baseDim.height !== maskDim.height) {
        console.error(`❌ CRÍTICO [${label}]: Dimensiones discordantes entre base.png (${baseDim.width}x${baseDim.height}) y mask.png (${maskDim.width}x${maskDim.height})`);
        criticalErrors++;
      } else if (baseDim.height % 128 !== 0 || baseDim.width % 128 !== 0) {
        console.error(`❌ CRÍTICO [${label}]: Alto y ancho deben ser múltiplos de 128 px (cuadrícula de frames). Actual: ${baseDim.width}x${baseDim.height}`);
        criticalErrors++;
      }
    } catch (err) {
      console.error(`❌ CRÍTICO [${label}]: Error leyendo PNG: ${err.message}`);
      criticalErrors++;
    }
  }

  // Validar anim.json y tags
  const animData = readJson(animPath);
  const frameTags = animData?.meta?.frameTags || [];
  const tagNames = new Set(frameTags.map(t => t.name));

  // Chequeo de tags críticos
  for (const crit of CRITICAL_TAGS) {
    if (!tagNames.has(crit)) {
      console.error(`❌ CRÍTICO [${label}]: Falta tag crítico "${crit}" en anim.json`);
      criticalErrors++;
    }
  }

  // Chequeo de tags recomendados
  for (const [rec, fallback] of Object.entries(RECOMMENDED_TAGS)) {
    if (!tagNames.has(rec)) {
      console.warn(`⚠️ ADVERTENCIA [${label}]: Tag recomendado "${rec}" no definido. Usará fallback automático -> "${fallback}"`);
      warnings++;
    }
  }

  validateAnchors(label, dir, animData);
  console.log(`✓ species/${label}/: base.png, mask.png, anim.json y anchors.json validados`);
}

// Anclas de accesorio (spec 38 §5): cuatro ranuras dentro del frame nativo de 64×64 y, por
// animación, tantos desplazamientos como frames tiene en anim.json.
const ANCHOR_SLOTS = ['head', 'face', 'neck', 'back'];
const ANCHOR_SIZES = ['S', 'M', 'L'];

function validateAnchors(label, dir, animData) {
  const anchorsPath = path.join(dir, 'anchors.json');
  if (!fs.existsSync(anchorsPath)) {
    console.error(`❌ CRÍTICO: Falta anchors.json en species/${label}/`);
    criticalErrors++;
    return;
  }
  const anchors = readJson(anchorsPath);
  const fail = (msg) => {
    console.error(`❌ CRÍTICO [${label}]: anchors.json: ${msg}`);
    criticalErrors++;
  };
  const isPoint = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isInteger);
  if (!ANCHOR_SIZES.includes(anchors.size)) fail(`size debe ser ${ANCHOR_SIZES.join(', ')}`);
  if (!Number.isInteger(anchors.eyeGap) || anchors.eyeGap < 1) fail('eyeGap debe ser un entero mayor que 0');
  for (const slot of ANCHOR_SLOTS) {
    const p = anchors.base?.[slot];
    if (!isPoint(p)) fail(`falta el ancla base '${slot}'`);
    else if (p.some((v) => v < 2 || v > 61)) fail(`el ancla '${slot}' (${p}) se sale del frame (2–61)`);
  }
  const frameCount = new Map((animData?.meta?.frameTags || []).map((t) => [t.name, t.to - t.from + 1]));
  for (const [anim, value] of Object.entries(anchors.frames || {})) {
    const expected = frameCount.get(anim);
    if (expected === undefined) {
      fail(`la animación '${anim}' no existe en anim.json`);
      continue;
    }
    const lists = Array.isArray(value) ? [['*', value]] : ANCHOR_SLOTS.map((slot) => [slot, value[slot]]);
    for (const [slot, list] of lists) {
      if (!Array.isArray(list) || list.length !== expected || !list.every(isPoint)) {
        fail(`'${anim}' (${slot}) debe tener ${expected} desplazamientos [dx, dy]`);
      }
    }
  }
}

for (const sp of speciesData) {
  const spDir = path.join(speciesDir, sp.id);
  if (!fs.existsSync(spDir)) {
    console.error(`❌ CRÍTICO: Carpeta no encontrada para especie "${sp.id}" en shared/assets/species/${sp.id}/`);
    criticalErrors++;
    continue;
  }
  validateSheet(sp.id, spDir);
  for (const stage of STAGE_DIRS) {
    const stageDir = path.join(spDir, stage);
    if (fs.existsSync(stageDir)) {
      validateSheet(`${sp.id}/${stage}`, stageDir);
    } else {
      console.warn(`⚠️ ADVERTENCIA [${sp.id}]: Sin hoja de etapa "${stage}". Los clientes usarán la de adult.`);
      warnings++;
    }
  }
}

// Accesorios (spec 38 §6): cada prenda del catálogo tiene su arte en tres tallas y un meta.json
// coherente con los PNG (que van a ×2 y con los frames en horizontal).
const accessoriesData = readJson(path.join(sharedGameDataDir, 'accessories.json'));
const accessoriesDir = path.join(sharedAssetsDir, 'accessories');
// Lienzo máximo por talla, en px nativos: [ancho, alto] (scripts/sprites/pixel/accessories.ts).
const ACC_CANVAS = { s: [40, 24], m: [48, 32], l: [56, 40] };
for (const acc of accessoriesData?.accessories || []) {
  const dir = path.join(accessoriesDir, acc.id);
  const fail = (msg) => {
    console.error(`❌ CRÍTICO [accessories/${acc.id}]: ${msg}`);
    criticalErrors++;
  };
  const metaPath = path.join(dir, 'meta.json');
  if (!fs.existsSync(metaPath)) {
    fail('falta meta.json (ejecuta pnpm generate:accessories)');
    continue;
  }
  const meta = readJson(metaPath);
  if (meta.slot !== acc.slot) fail(`meta.slot es '${meta.slot}' y el catálogo dice '${acc.slot}'`);
  if (!Number.isInteger(meta.frames) || meta.frames < 1) fail('frames debe ser un entero mayor que 0');
  if (!!acc.animated !== meta.frames > 1) fail('"animated" del catálogo no coincide con los frames del arte');
  for (const size of Object.keys(ACC_CANVAS)) {
    const s = meta.sizes?.[size];
    const pngPath = path.join(dir, `${size}.png`);
    if (!s || !fs.existsSync(pngPath)) {
      fail(`falta la talla ${size.toUpperCase()}`);
      continue;
    }
    const [maxW, maxH] = ACC_CANVAS[size];
    if (s.w > maxW || s.h > maxH) fail(`talla ${size.toUpperCase()}: ${s.w}×${s.h} no cabe en el lienzo (${maxW}×${maxH})`);
    const a = s.anchor;
    if (!Array.isArray(a) || a.length !== 2 || !a.every(Number.isInteger)) fail(`talla ${size.toUpperCase()}: anchor debe ser [x, y]`);
    try {
      const dim = readPngDimensions(pngPath);
      if (dim.width !== s.w * meta.scale * meta.frames || dim.height !== s.h * meta.scale) {
        fail(`talla ${size.toUpperCase()}: el PNG mide ${dim.width}×${dim.height} y meta.json dice ${s.w * meta.scale * meta.frames}×${s.h * meta.scale}`);
      }
    } catch (err) {
      fail(`error leyendo ${size}.png: ${err.message}`);
    }
  }
}
console.log(`✓ accessories/: ${(accessoriesData?.accessories || []).length} prendas con arte en tres tallas`);

// Objetos consumibles (GUIA_ARTISTICA §7.7): un icono de 32×32 nativos a ×2 por objeto de foods.json.
// El arte es opcional mientras los clientes usen el icono genérico: que falte es un aviso.
const foodsData = readJson(path.join(sharedGameDataDir, 'foods.json')) || [];
const itemsDir = path.join(sharedAssetsDir, 'items');
const ITEM_SIDE = 64;
let itemsWithArt = 0;
if (fs.existsSync(itemsDir)) {
  const manifest = fs.existsSync(path.join(itemsDir, 'manifest.json')) ? readJson(path.join(itemsDir, 'manifest.json')) : null;
  for (const file of fs.readdirSync(itemsDir).filter((f) => f.endsWith('.png'))) {
    const id = file.slice(0, -4);
    const fail = (msg) => {
      console.error(`❌ CRÍTICO [items/${id}]: ${msg}`);
      criticalErrors++;
    };
    if (!foodsData.some((f) => f.id === id)) {
      fail('hay arte para un objeto que no está en foods.json');
      continue;
    }
    try {
      const dim = readPngDimensions(path.join(itemsDir, file));
      if (dim.width !== ITEM_SIDE || dim.height !== ITEM_SIDE) fail(`el PNG mide ${dim.width}×${dim.height} y debe medir ${ITEM_SIDE}×${ITEM_SIDE}`);
    } catch (err) {
      fail(`error leyendo ${file}: ${err.message}`);
    }
    if (!manifest?.items?.[id]) fail('no está en manifest.json (ejecuta pnpm generate:items)');
    itemsWithArt++;
  }
  for (const id of Object.keys(manifest?.items || {})) {
    if (!fs.existsSync(path.join(itemsDir, `${id}.png`))) {
      console.error(`❌ CRÍTICO [items/${id}]: manifest.json lo lista y falta su PNG`);
      criticalErrors++;
    }
  }
}
if (itemsWithArt < foodsData.length) {
  console.warn(`⚠️ ADVERTENCIA [items]: ${foodsData.length - itemsWithArt} de ${foodsData.length} objetos sin icono. Los clientes usarán el icono genérico.`);
  warnings++;
}
console.log(`✓ items/: ${itemsWithArt} de ${foodsData.length} objetos con icono`);

// Minijuegos (skill pockai-minigame-architect): piezas de 32 o 48 px nativos a ×2 y un fondo de arena
// por juego. El arte es opcional (la vista pinta un recuadro en su lugar): que falte es un aviso.
const minigameIds = Object.keys(readJson(path.join(sharedGameDataDir, 'balance.json'))?.minigames?.games || {});
const minigamesDir = path.join(sharedAssetsDir, 'minigames');
let minigamesWithArt = 0;
if (fs.existsSync(minigamesDir)) {
  const manifest = fs.existsSync(path.join(minigamesDir, 'manifest.json')) ? readJson(path.join(minigamesDir, 'manifest.json')) : null;
  for (const entry of fs.readdirSync(minigamesDir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    const game = entry.name;
    const fail = (msg) => {
      console.error(`❌ CRÍTICO [minigames/${game}]: ${msg}`);
      criticalErrors++;
    };
    if (!minigameIds.includes(game)) {
      fail('no es un minijuego de balance.json');
      continue;
    }
    for (const file of fs.readdirSync(path.join(minigamesDir, game))) {
      if (file === 'backdrop.webp') {
        if (!manifest?.games?.[game]?.backdrop) fail('backdrop.webp no está en manifest.json (ejecuta pnpm generate:minigames)');
      } else if (file.endsWith('.png')) {
        const piece = file.replace('.png', '');
        try {
          const dim = readPngDimensions(path.join(minigamesDir, game, file));
          if (dim.width !== dim.height || ![64, 96].includes(dim.width)) fail(`${file} mide ${dim.width}×${dim.height} (debe ser 64×64 o 96×96)`);
        } catch {
          fail(`${file} no es un PNG válido`);
        }
        if (!manifest?.games?.[game]?.pieces?.[piece]) fail(`${file} no está en manifest.json (ejecuta pnpm generate:minigames)`);
      } else {
        fail(`${file}: solo se admiten piezas .png y backdrop.webp`);
      }
    }
    minigamesWithArt++;
  }
  for (const [game, g] of Object.entries(manifest?.games || {})) {
    for (const piece of Object.keys(g.pieces || {})) {
      if (!fs.existsSync(path.join(minigamesDir, game, `${piece}.png`))) {
        console.error(`❌ CRÍTICO [minigames/${game}]: manifest.json lista la pieza ${piece} y falta su PNG`);
        criticalErrors++;
      }
    }
  }
}
if (minigamesWithArt < minigameIds.length) {
  console.warn(`⚠️ ADVERTENCIA [minigames]: ${minigameIds.length - minigamesWithArt} de ${minigameIds.length} minijuegos sin arte propio.`);
  warnings++;
}
console.log(`✓ minigames/: ${minigamesWithArt} de ${minigameIds.length} minijuegos con arte`);

console.log('\n=== Resumen de Validación ===');
console.log(`Errores críticos: ${criticalErrors}`);
console.log(`Advertencias (con fallback activo): ${warnings}`);

if (criticalErrors > 0) {
  console.error('\n❌ La validación de assets ha fallado debido a errores críticos.');
  process.exit(1);
} else {
  console.log('\n✅ Todos los assets cumplen con el estándar del Pipeline de Arte.');
  process.exit(0);
}
