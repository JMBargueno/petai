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
  sit: 'idle',
  clean: 'happy',
  sad: 'idle',
  sick: 'idle',
  cast: 'attack',
  hurt: 'idle',
  faint: 'sleep',
  talk: 'happy'
};

for (const sp of speciesData) {
  const spDir = path.join(speciesDir, sp.id);
  if (!fs.existsSync(spDir)) {
    console.error(`❌ CRÍTICO: Carpeta no encontrada para especie "${sp.id}" en shared/assets/species/${sp.id}/`);
    criticalErrors++;
    continue;
  }

  const basePath = path.join(spDir, 'base.png');
  const maskPath = path.join(spDir, 'mask.png');
  const animPath = path.join(spDir, 'anim.json');

  if (!fs.existsSync(basePath)) {
    console.error(`❌ CRÍTICO: Falta base.png en species/${sp.id}/`);
    criticalErrors++;
  }
  if (!fs.existsSync(maskPath)) {
    console.error(`❌ CRÍTICO: Falta mask.png en species/${sp.id}/`);
    criticalErrors++;
  }
  if (!fs.existsSync(animPath)) {
    console.error(`❌ CRÍTICO: Falta anim.json en species/${sp.id}/`);
    criticalErrors++;
    continue;
  }

  // Comprobar dimensiones idénticas
  if (fs.existsSync(basePath) && fs.existsSync(maskPath)) {
    try {
      const baseDim = readPngDimensions(basePath);
      const maskDim = readPngDimensions(maskPath);

      if (baseDim.width !== maskDim.width || baseDim.height !== maskDim.height) {
        console.error(`❌ CRÍTICO [${sp.id}]: Dimensiones discordantes entre base.png (${baseDim.width}x${baseDim.height}) y mask.png (${maskDim.width}x${maskDim.height})`);
        criticalErrors++;
      } else if (baseDim.height !== 128 || baseDim.width % 128 !== 0) {
        console.error(`❌ CRÍTICO [${sp.id}]: La altura debe ser 128 px y el ancho múltiplo de 128 px. Actual: ${baseDim.width}x${baseDim.height}`);
        criticalErrors++;
      }
    } catch (err) {
      console.error(`❌ CRÍTICO [${sp.id}]: Error leyendo PNG: ${err.message}`);
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
      console.error(`❌ CRÍTICO [${sp.id}]: Falta tag crítico "${crit}" en anim.json`);
      criticalErrors++;
    }
  }

  // Chequeo de tags recomendados
  for (const [rec, fallback] of Object.entries(RECOMMENDED_TAGS)) {
    if (!tagNames.has(rec)) {
      console.warn(`⚠️ ADVERTENCIA [${sp.id}]: Tag recomendado "${rec}" no definido. Usará fallback automático -> "${fallback}"`);
      warnings++;
    }
  }

  console.log(`✓ species/${sp.id}/: base.png, mask.png y anim.json validados`);
}

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
