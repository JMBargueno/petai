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
// Spec 39: todo minijuego tiene variante accesible; las Pruebas, un elemento real; los premios, un objeto que existe.
const a11y = readJson('shared/game-data/accessibility.json');
const ELEMENTS = new Set(['fire', 'water', 'plant', 'electric', 'shadow', 'light']);
for (const [id, g] of Object.entries(mg.games)) {
  if (!a11y.minigames || !a11y.minigames[id]) {
    throw new Error(`minijuego ${id}: falta su variante accesible en accessibility.json (minigames.${id})`);
  }
  if (g.element !== undefined && !ELEMENTS.has(g.element)) {
    throw new Error(`minijuego ${id}: elemento desconocido "${g.element}"`);
  }
  if (g.itemDrop) {
    const d = g.itemDrop;
    if (!foods.some((f) => f.id === d.itemId)) throw new Error(`minijuego ${id}: itemDrop.itemId "${d.itemId}" no existe en foods.json`);
    if (!(d.chance > 0 && d.chance <= 1) || !(d.minScore >= 0)) throw new Error(`minijuego ${id}: itemDrop inválido`);
  }
}
console.log(`✓ balance.json: sueño, evolución y ${Object.keys(mg.games).length} minijuegos validados`);

// 1c. Personalidad: 5 dimensiones con bandas contiguas 0-100 y keyword única
const PERSONALITY_DIMS = ['curiosity', 'sociability', 'bravery', 'affection', 'temper'];
const pers = balance.personality;
if (pers) {
  for (const dim of PERSONALITY_DIMS) {
    const bands = pers.dimensions?.[dim]?.bands;
    if (!Array.isArray(bands) || bands.length === 0) throw new Error(`balance.personality.dimensions.${dim}.bands vacío`);
    let prev = -1;
    const kws = new Set();
    for (const b of bands) {
      if (!Number.isInteger(b.max) || b.max <= prev) throw new Error(`balance.personality.${dim}: bandas no crecientes en max=${b.max}`);
      if (!b.keyword || kws.has(b.keyword)) throw new Error(`balance.personality.${dim}: keyword vacía o repetida (${b.keyword})`);
      kws.add(b.keyword);
      prev = b.max;
    }
    if (prev !== 100) throw new Error(`balance.personality.${dim}: la última banda debe terminar en 100`);
  }
  for (const [ev, deltas] of Object.entries(pers.evolution?.events ?? {})) {
    for (const k of Object.keys(deltas)) {
      if (!PERSONALITY_DIMS.includes(k)) throw new Error(`balance.personality.evolution.events.${ev}: dimensión desconocida ${k}`);
    }
  }
  const mem = pers.memory;
  if (mem) {
    if (!(mem.minRecallScore >= 0 && mem.minRecallScore < 1)) throw new Error('balance.personality.memory.minRecallScore debe estar en [0, 1)');
    if (!(mem.recentRecallMinutes > 0) || !(mem.recentRecallPenalty >= 0)) throw new Error('balance.personality.memory: recentRecallMinutes/recentRecallPenalty inválidos');
  }
  for (const id of pers.autonomy?.itemFind?.items ?? []) {
    if (!foods.some((f) => f.id === id)) throw new Error(`balance.personality.autonomy.itemFind: ${id} no existe en foods.json`);
  }
  console.log('✓ balance.json: personalidad (5 dimensiones, evolución y autonomía) validada');

  // 1c-ter. Sala del hábitat: acciones con pesos por dimensión y empuje por necesidades
  const roomCfg = pers.room;
  if (roomCfg) {
    const where = 'balance.personality.room';
    const INTERACTIONS = ['sleep', 'eat', 'play', 'bathe', 'sit'];
    const ROOM_BOOSTS = ['lowHunger', 'highHunger', 'lowHygiene', 'highHygiene', 'lowEnergy', 'highEnergy', 'lowHappiness', 'highHappiness'];
    const ar = roomCfg.antiRepeat;
    if (!ar || !Number.isInteger(ar.window) || ar.window < 1 || !(ar.penalty > 0 && ar.penalty <= 1) || !Number.isInteger(ar.top) || ar.top < 1 || !(ar.margin >= 0)) {
      throw new Error(`${where}.antiRepeat inválido`);
    }
    if (!(roomCfg.needs?.low >= 0 && roomCfg.needs.high > roomCfg.needs.low && roomCfg.needs.high <= 100)) throw new Error(`${where}.needs inválido`);
    const actions = Object.entries(roomCfg.actions ?? {});
    for (const [id, a] of actions) {
      const at = `${where}.actions.${id}`;
      if (!(typeof a.base === 'number' && a.base > 0)) throw new Error(`${at}.base debe ser > 0`);
      for (const [k, v] of Object.entries(a.weights ?? {})) {
        if (!PERSONALITY_DIMS.includes(k) || typeof v !== 'number') throw new Error(`${at}.weights.${k} inválido`);
      }
      if (a.interaction !== undefined && !INTERACTIONS.includes(a.interaction)) throw new Error(`${at}.interaction desconocida: ${a.interaction}`);
      if (a.cooldownMs !== undefined && !(a.cooldownMs > 0)) throw new Error(`${at}.cooldownMs inválido`);
      for (const [k, v] of Object.entries(a.boost ?? {})) {
        if (!ROOM_BOOSTS.includes(k) || !(typeof v === 'number' && v > 0)) throw new Error(`${at}.boost.${k} inválido`);
      }
      for (const k of Object.keys(a.requires ?? {})) if (k !== 'sunny') throw new Error(`${at}.requires.${k}: requisito desconocido`);
    }
    // Sin muebles ni buen tiempo tiene que quedar algo que hacer
    if (!actions.some(([, a]) => !a.interaction && !a.requires)) throw new Error(`${where}.actions: hace falta una acción sin mueble ni requisitos`);
    console.log(`✓ balance.json: sala del hábitat (${actions.length} acciones) validada`);
  }

  // 1c-bis. Cerebro del escritorio: conductas con pesos por dimensión y requisitos declarativos
  const desk = pers.desktop;
  if (desk) {
    const where = 'balance.personality.desktop';
    const REQUIRES = {
      minEnergy: 'number', maxEnergy: 'number', minHappiness: 'number', skill: 'string', cursor: 'string',
      userActive: 'boolean', typing: 'boolean', motion: 'boolean', newTimeSlot: 'boolean', window: 'boolean',
      apps: 'array', moods: 'array', minDims: 'dims', maxDims: 'dims',
    };
    const CURSOR_KINDS = ['near', 'still', 'fast', 'slow', 'approaching'];
    const APPS = ['coding', 'music', 'video', 'gaming', 'reading'];
    const MOODS = ['sick', 'hungry', 'exhausted', 'dirty', 'sad', 'happy', 'calm'];
    const BOOSTS = ['lowEnergy', 'highEnergy', 'lowHappiness', 'highHappiness'];
    const posNum = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
    const range = (v) => Array.isArray(v) && v.length === 2 && posNum(v[0]) && v[1] >= v[0];
    const checkDims = (obj, at) => {
      for (const [k, v] of Object.entries(obj ?? {})) {
        if (!PERSONALITY_DIMS.includes(k)) throw new Error(`${at}: dimensión desconocida ${k}`);
        if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${at}.${k} debe ser un número`);
      }
    };

    if (!posNum(desk.thinkMs)) throw new Error(`${where}.thinkMs inválido`);
    if (!range(desk.pauseMs)) throw new Error(`${where}.pauseMs debe ser [min, max]`);
    if (!range(desk.perch?.stayMs) || !posNum(desk.perch?.hopCooldownMs)) throw new Error(`${where}.perch inválido`);
    const ar = desk.antiRepeat;
    if (!ar || !Number.isInteger(ar.window) || ar.window < 1 || !(ar.penalty > 0 && ar.penalty <= 1) || !Number.isInteger(ar.top) || ar.top < 1 || !(ar.margin >= 0)) {
      throw new Error(`${where}.antiRepeat inválido`);
    }
    if (!(desk.needs?.low >= 0 && desk.needs.high > desk.needs.low && desk.needs.high <= 100)) throw new Error(`${where}.needs inválido`);
    for (const k of ['slow', 'walk', 'run', 'climb']) if (!posNum(desk.speeds?.[k])) throw new Error(`${where}.speeds.${k} inválido`);
    for (const k of ['napAfterMs', 'welcomeMinAwayMs', 'longAwayMs', 'typingStillMs', 'typingRecentMs', 'cursorOnlyFactor']) {
      if (!posNum(desk.idle?.[k])) throw new Error(`${where}.idle.${k} inválido`);
    }
    for (const k of ['nearPx', 'stalkMinPx', 'stalkMaxPx', 'stillMs', 'fastPxPerS', 'slowPxPerS', 'shyPx', 'followGapPx', 'catchPx']) {
      if (!posNum(desk.cursor?.[k])) throw new Error(`${where}.cursor.${k} inválido`);
    }
    if (!posNum(desk.barks?.everyMs)) throw new Error(`${where}.barks.everyMs inválido`);

    const ids = Object.keys(desk.behaviors ?? {});
    if (ids.length === 0) throw new Error(`${where}.behaviors vacío`);
    for (const id of ids) {
      const b = desk.behaviors[id];
      const at = `${where}.behaviors.${id}`;
      if (!posNum(b.base)) throw new Error(`${at}.base debe ser > 0`);
      checkDims(b.weights, `${at}.weights`);
      if (b.cooldownMs !== undefined && !posNum(b.cooldownMs)) throw new Error(`${at}.cooldownMs inválido`);
      for (const [k, v] of Object.entries(b.boost ?? {})) {
        if (!BOOSTS.includes(k) || !posNum(v)) throw new Error(`${at}.boost.${k} inválido`);
      }
      for (const [k, v] of Object.entries(b.requires ?? {})) {
        const kind = REQUIRES[k];
        // Lista blanca: un requisito desconocido se ignoraría en silencio y la conducta saldría siempre
        if (!kind) throw new Error(`${at}.requires.${k}: requisito desconocido`);
        if (kind === 'array') {
          const allowed = k === 'apps' ? APPS : MOODS;
          if (!Array.isArray(v) || v.length === 0 || v.some((x) => !allowed.includes(x))) throw new Error(`${at}.requires.${k} inválido`);
        } else if (kind === 'dims') {
          checkDims(v, `${at}.requires.${k}`);
        } else if (typeof v !== kind) {
          throw new Error(`${at}.requires.${k} debe ser ${kind}`);
        }
      }
      if (b.requires?.cursor && !CURSOR_KINDS.includes(b.requires.cursor)) throw new Error(`${at}.requires.cursor inválido`);
    }
    for (const id of desk.focus ?? []) if (!ids.includes(id)) throw new Error(`${where}.focus: conducta desconocida ${id}`);
    if (!Array.isArray(desk.focus) || desk.focus.length === 0) throw new Error(`${where}.focus vacío: en un Pomodoro no tendría nada que hacer`);
    // Con una personalidad cualquiera y sin habilidades debe quedar algo que hacer
    if (!ids.some((id) => !desk.behaviors[id].requires)) throw new Error(`${where}.behaviors: hace falta al menos una conducta sin requisitos`);
    for (const [app, profile] of Object.entries(desk.appProfiles ?? {})) {
      if (!APPS.includes(app)) throw new Error(`${where}.appProfiles: app desconocida ${app}`);
      if (!(profile.barkFactor >= 0 && profile.barkFactor <= 1)) throw new Error(`${where}.appProfiles.${app}.barkFactor debe estar en 0-1`);
      for (const [id, f] of Object.entries(profile.factors ?? {})) {
        if (!ids.includes(id)) throw new Error(`${where}.appProfiles.${app}: conducta desconocida ${id}`);
        if (!(typeof f === 'number' && f >= 0)) throw new Error(`${where}.appProfiles.${app}.${id} debe ser ≥ 0`);
      }
    }
    console.log(`✓ balance.json: cerebro del escritorio (${ids.length} conductas) validado`);
  }
}

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
  // Sesgo de personalidad (opcional): 5 dimensiones enteras 0-100
  if (sp.personalityBias !== undefined) {
    for (const [k, v] of Object.entries(sp.personalityBias)) {
      if (!PERSONALITY_DIMS.includes(k)) throw new Error(`personalityBias.${k} en especie ${sp.id} no es una dimensión válida`);
      if (!Number.isInteger(v) || v < 0 || v > 100) throw new Error(`personalityBias.${k} en especie ${sp.id} debe ser entero 0-100`);
    }
  }
}
console.log(`✓ species.json: ${species.length} especies validadas con relaciones cruzadas`);

// 4. Validar patrones
for (const pat of patterns) {
  if (!rarities[pat.rarity]) {
    throw new Error(`Rareza '${pat.rarity}' en patrón ${pat.id} no está en balance.json`);
  }
}
console.log(`✓ patterns.json: ${patterns.length} patrones validados`);

// 4b. Validar accesorios (spec 38): ranura, rareza, color y vía de desbloqueo
const accessoriesData = readJson('shared/game-data/accessories.json');
const achievements = readJson('shared/game-data/achievements.json').achievements;
const ACCESSORY_SLOTS = ['head', 'face', 'neck', 'back'];
const ACCESSORY_COLORS = new Set(['ember', 'sunburst', 'mint', 'blue', 'violet', 'lavender', 'white', 'carbon']);
const ACCESSORY_FX = new Set(['heart', 'zzz', 'sparkle', 'drop']);
if (JSON.stringify(accessoriesData.slots) !== JSON.stringify(ACCESSORY_SLOTS)) {
  throw new Error(`accessories.json: slots debe ser ${JSON.stringify(ACCESSORY_SLOTS)}`);
}
if (!Array.isArray(accessoriesData.accessories)) {
  throw new Error('accessories.json: falta la lista accessories');
}
const accessoryIds = new Set();
const achievementById = new Map(achievements.map((a) => [a.id, a]));
for (const acc of accessoriesData.accessories) {
  const where = `accesorio ${acc.id}`;
  if (typeof acc.id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(acc.id) || acc.id.length > 64) {
    throw new Error(`accessories.json: id inválido '${acc.id}'`);
  }
  if (accessoryIds.has(acc.id)) throw new Error(`accessories.json: id duplicado '${acc.id}'`);
  if (foodIds.has(acc.id)) throw new Error(`${where}: el id ya existe en foods.json`);
  accessoryIds.add(acc.id);
  for (const k of ['name', 'description']) {
    if (typeof acc[k] !== 'string' || acc[k].trim() === '') throw new Error(`${where}: falta ${k}`);
  }
  if (!ACCESSORY_SLOTS.includes(acc.slot)) throw new Error(`${where}: ranura '${acc.slot}' no reconocida`);
  if (!rarities[acc.rarity]) throw new Error(`${where}: rareza '${acc.rarity}' no está en balance.json`);
  if (!ACCESSORY_COLORS.has(acc.color)) throw new Error(`${where}: color '${acc.color}' no es una rampa de accesorio`);
  if (acc.animated !== undefined && typeof acc.animated !== 'boolean') throw new Error(`${where}: animated debe ser booleano`);
  if (acc.fx !== undefined && !ACCESSORY_FX.has(acc.fx)) throw new Error(`${where}: fx '${acc.fx}' no reconocida`);
  const unlock = acc.unlock || {};
  const isAchievementId = acc.id.startsWith('ach_item_');
  if (unlock.type === 'coins' || unlock.type === 'gems') {
    if (!Number.isInteger(unlock.price) || unlock.price <= 0) throw new Error(`${where}: unlock.price debe ser un entero mayor que 0`);
    if (!acc.id.startsWith('acc_')) throw new Error(`${where}: una prenda de compra lleva el prefijo acc_`);
  } else if (unlock.type === 'achievement') {
    const ach = achievementById.get(unlock.achievementId);
    if (!ach) throw new Error(`${where}: el logro '${unlock.achievementId}' no existe en achievements.json`);
    if (!ach.reward || ach.reward.itemId !== acc.id) {
      throw new Error(`${where}: el logro '${ach.id}' no entrega esta prenda (reward.itemId = ${ach.reward && ach.reward.itemId})`);
    }
    if (unlock.price !== undefined) throw new Error(`${where}: una prenda de logro no lleva precio`);
  } else {
    throw new Error(`${where}: unlock.type debe ser coins, gems o achievement`);
  }
  if (isAchievementId && unlock.type !== 'achievement') {
    throw new Error(`${where}: un id ach_item_* solo se desbloquea por logro`);
  }
}
for (const slot of ACCESSORY_SLOTS) {
  if (!accessoriesData.accessories.some((a) => a.slot === slot)) throw new Error(`accessories.json: ninguna prenda en la ranura '${slot}'`);
}
console.log(`✓ accessories.json: ${accessoriesData.accessories.length} accesorios validados con sus logros`);

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
