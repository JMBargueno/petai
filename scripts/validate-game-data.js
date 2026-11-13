// Script de validación de integridad para shared/game-data
const fs = require('fs');
const path = require('path');

function readJson(relPath) {
  const fullPath = path.resolve(__dirname, '..', relPath);
  try {
    const raw = fs.readFileSync(fullPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Error leyendo/parseando ${relPath}:`, err.message);
    process.exit(1);
  }
}

console.log('--- Validando shared/game-data ---');

const balance = readJson('shared/game-data/balance.json');
const species = readJson('shared/game-data/species.json');
const patterns = readJson('shared/game-data/patterns.json');
const foods = readJson('shared/game-data/foods.json');

// 1. Validar probabilidades en balance.json
const rarities = balance.rarity;
let totalProb = 0;
for (const [key, val] of Object.entries(rarities)) {
  if (typeof val.probability !== 'number' || typeof val.multiplier !== 'number') {
    throw new Error(`Entrada de rareza inválida para ${key}`);
  }
  totalProb += val.probability;
}
if (Math.abs(totalProb - 1.0) > 0.0001) {
  throw new Error(`Las probabilidades de rareza deben sumar 1.0. Suma actual: ${totalProb}`);
}
console.log('✓ balance.json: Probabilidades de rareza suman 1.0');

// 1b. Secciones de Fase 2: sueño, evolución y minijuegos
const sleep = balance.sleep;
if (!sleep || sleep.nightStartHour < 0 || sleep.nightStartHour > 23 || sleep.nightEndHour < 0 || sleep.nightEndHour > 23) {
  throw new Error('balance.sleep inválido: las horas deben estar entre 0 y 23');
}
const evo = balance.evolution;
if (!evo || !foods.some((f) => f.id === evo.finalStageItemId && f.kind === 'evolution')) {
  throw new Error('balance.evolution.finalStageItemId debe existir en foods.json con kind "evolution"');
}
const mg = balance.minigames;
if (!mg || !mg.games || Object.keys(mg.games).length === 0) {
  throw new Error('balance.minigames.games vacío o ausente');
}
for (const [id, g] of Object.entries(mg.games)) {
  for (const k of ['durationSeconds', 'minDurationSeconds', 'maxScorePerSecond', 'coinsPerPoint', 'maxCoins', 'xpPerPoint', 'maxXp', 'happiness']) {
    if (typeof g[k] !== 'number' || g[k] < 0) throw new Error(`balance.minigames.games.${id}.${k} inválido`);
  }
  if (g.minDurationSeconds > g.durationSeconds) {
    throw new Error(`minijuego ${id}: minDurationSeconds no puede superar durationSeconds`);
  }
}
console.log(`✓ balance.json: sueño, evolución y ${Object.keys(mg.games).length} minijuegos validados`);

// 2. Validar comidas
const foodIds = new Set(foods.map(f => f.id));
if (foodIds.size !== foods.length) {
  throw new Error('IDs de alimentos duplicados en foods.json');
}
console.log(`✓ foods.json: ${foods.length} alimentos validados`);

// 3. Validar especies
const validElements = new Set(['fire', 'water', 'plant', 'electric', 'shadow', 'light']);
for (const sp of species) {
  if (!validElements.has(sp.element)) {
    throw new Error(`Elemento no reconocido '${sp.element}' en especie ${sp.id}`);
  }
  if (!foodIds.has(sp.favoriteFood)) {
    throw new Error(`favoriteFood '${sp.favoriteFood}' en especie ${sp.id} no existe en foods.json`);
  }
  if (!rarities[sp.rarity]) {
    throw new Error(`Rareza '${sp.rarity}' en especie ${sp.id} no está en balance.json`);
  }
}
console.log(`✓ species.json: ${species.length} especies validadas con relaciones cruzadas`);

// 4. Validar patrones
for (const pat of patterns) {
  if (!rarities[pat.minRarity]) {
    throw new Error(`minRarity '${pat.minRarity}' en patrón ${pat.id} no está en balance.json`);
  }
}
console.log(`✓ patterns.json: ${patterns.length} patrones validados`);

// 5. Validar existencia de sprites base
const spritesDir = path.resolve(__dirname, '..', 'shared/assets/sprites');
for (const sp of species) {
  for (const anim of ['idle', 'eat', 'happy', 'sleep']) {
    const filename = `${sp.spriteKey}_${anim}.svg`;
    const fullSpritePath = path.join(spritesDir, filename);
    if (!fs.existsSync(fullSpritePath)) {
      throw new Error(`Sprite requerido no encontrado: ${filename}`);
    }
  }
}
console.log('✓ shared/assets/sprites: Todos los sprites de animación requeridos están presentes');

console.log('=== TODOS LOS DATOS DE JUEGO Y ASSETS SON VÁLIDOS ===');
