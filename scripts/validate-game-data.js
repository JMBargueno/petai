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
const skills = readJson('shared/game-data/skills.json');

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

// 1c. Combate (Fase 4): balance, ligas y habilidades
const cb = balance.combats;
for (const k of ['dailyFreeBattles', 'energyCostPerBattle', 'maxRounds', 'hpMultiplier', 'damageScale', 'critChance', 'critMultiplier', 'elementAdvantage', 'elementDisadvantage', 'burnPctPerTurn', 'guardDefMultiplier']) {
  if (typeof cb?.[k] !== 'number' || cb[k] <= 0) throw new Error(`balance.combats.${k} inválido`);
}
if (!cb.elo || cb.elo.k <= 0 || cb.elo.window <= 0 || cb.elo.maxWindow < cb.elo.window) throw new Error('balance.combats.elo inválido');
if (!Array.isArray(cb.leagues) || cb.leagues.length < 2 || cb.leagues[0].minElo !== 0) {
  throw new Error('balance.combats.leagues debe empezar en minElo 0');
}
for (let i = 1; i < cb.leagues.length; i++) {
  if (cb.leagues[i].minElo <= cb.leagues[i - 1].minElo) throw new Error('Las ligas deben estar ordenadas por minElo creciente');
}
for (const r of ['win', 'draw', 'loss']) {
  if (typeof cb.rewards?.[r]?.xp !== 'number' || typeof cb.rewards?.[r]?.coins !== 'number') throw new Error(`balance.combats.rewards.${r} inválido`);
}
const skillIds = new Set();
const elements = new Set(species.map((s) => s.element));
for (const sk of skills) {
  if (skillIds.has(sk.id)) throw new Error(`Habilidad duplicada: ${sk.id}`);
  skillIds.add(sk.id);
  if (!['attack', 'heal', 'guard'].includes(sk.kind)) throw new Error(`Habilidad ${sk.id}: kind inválido`);
  if (sk.element !== 'neutral' && !elements.has(sk.element)) throw new Error(`Habilidad ${sk.id}: elemento sin especies (${sk.element})`);
  if (!(sk.accuracy > 0 && sk.accuracy <= 100) || sk.cooldown < 0 || sk.unlockLevel < 1) throw new Error(`Habilidad ${sk.id}: valores inválidos`);
  if (sk.kind === 'attack' && !(sk.power > 0)) throw new Error(`Habilidad ${sk.id}: un ataque necesita power`);
}
for (const el of elements) {
  if (!skills.some((s) => s.element === el && s.unlockLevel === 1)) throw new Error(`El elemento ${el} no tiene habilidad de nivel 1`);
}
if (!skills.some((s) => s.id === 'tackle')) throw new Error('Falta la habilidad base "tackle"');
console.log(`✓ combate: ${skills.length} habilidades y ${cb.leagues.length} ligas validadas`);

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
