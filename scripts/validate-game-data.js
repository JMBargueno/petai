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
  if (mem && (!(mem.repeatBoost >= 0) || !(mem.repeatCap > 0 && mem.repeatCap <= 1))) {
    throw new Error('balance.personality.memory: repeatBoost/repeatCap inválidos');
  }
  if (mem && !(Number.isInteger(mem.earlyExtractEvery) && mem.earlyExtractEvery >= 0)) {
    throw new Error('balance.personality.memory.earlyExtractEvery debe ser un entero ≥ 0 (0 = desactivado)');
  }
  for (const id of pers.autonomy?.itemFind?.items ?? []) {
    if (!foods.some((f) => f.id === id)) throw new Error(`balance.personality.autonomy.itemFind: ${id} no existe en foods.json`);
  }
  console.log('✓ balance.json: personalidad (5 dimensiones, evolución y autonomía) validada');

  // 1c-quinquies. Reacciones del chat: catálogo y tabla por intención (spec 37 §4.3)
  const beh = pers.behavior;
  if (beh?.reactions) {
    const where = 'balance.personality.behavior';
    const AUDIENCES = ['owner', 'visitor', 'pockai'];
    const catalog = beh.catalog ?? {};
    const ids = Object.keys(catalog);
    if (!ids.includes('listen') || !ids.includes('yawn')) throw new Error(`${where}.catalog: faltan listen o yawn (son las reacciones de respaldo)`);
    const ar = beh.antiRepeat;
    if (!ar || !Number.isInteger(ar.window) || ar.window < 1 || !(ar.penalty > 0 && ar.penalty <= 1) || !(ar.margin >= 0)) throw new Error(`${where}.antiRepeat inválido`);
    for (const [id, c] of Object.entries(catalog)) {
      const at = `${where}.catalog.${id}`;
      // Una reacción sin audiencia no se podría elegir nunca
      if (!Array.isArray(c.audiences) || c.audiences.length === 0) throw new Error(`${at}: sin audiencia`);
      for (const a of c.audiences) if (!AUDIENCES.includes(a)) throw new Error(`${at}: audiencia desconocida ${a}`);
      for (const [k, v] of Object.entries(c.minDims ?? {})) {
        if (!PERSONALITY_DIMS.includes(k) || typeof v !== 'number') throw new Error(`${at}.minDims.${k} inválido`);
      }
      if (c.minDims && !ids.includes(c.fallback)) throw new Error(`${at}: con minDims hace falta un fallback del catálogo`);
      if (c.when !== undefined && !['has_find', 'untold', 'first_turn_today', 'after_scold', 'knows_trick'].includes(c.when)) {
        throw new Error(`${at}.when: condición desconocida ${c.when}`);
      }
    }
    for (const [intent, list] of Object.entries(beh.reactions)) {
      const at = `${where}.reactions.${intent}`;
      if (!Array.isArray(list) || list.length === 0) throw new Error(`${at} vacío`);
      for (const r of list) {
        if (!ids.includes(r.behavior)) throw new Error(`${at}: reacción fuera de catálogo ${r.behavior}`);
        if (!(typeof r.base === 'number' && r.base >= 0)) throw new Error(`${at}.${r.behavior}.base debe ser ≥ 0`);
        for (const [k, v] of Object.entries(r.weights ?? {})) {
          if (!PERSONALITY_DIMS.includes(k) || typeof v !== 'number') throw new Error(`${at}.${r.behavior}.weights.${k} inválido`);
        }
        if (r.product) {
          const dimsOk = (xs) => Array.isArray(xs) && xs.every((d) => PERSONALITY_DIMS.includes(d));
          if (typeof r.product.scale !== 'number' || !dimsOk(r.product.dims ?? []) || !dimsOk(r.product.inverse ?? [])) throw new Error(`${at}.${r.behavior}.product inválido`);
        }
        if (!(r.base > 0) && !r.product) throw new Error(`${at}.${r.behavior}: sin base ni producto nunca puntuaría`);
      }
      // Toda intención necesita al menos una candidata para el entrenador
      if (!list.some((r) => catalog[r.behavior].audiences.includes('owner') && !catalog[r.behavior].when)) {
        throw new Error(`${at}: ninguna candidata sin condiciones para el entrenador`);
      }
    }
    console.log(`✓ balance.json: reacciones del chat (${ids.length} en catálogo, ${Object.keys(beh.reactions).length} intenciones) validadas`);
  }

  // Actividades autónomas: las cinco de siempre son obligatorias; las nuevas, opcionales
  const acts = pers.autonomy?.activities ?? {};
  for (const id of ['rest', 'play_alone', 'explore', 'socialize', 'wait_owner']) {
    if (!acts[id]) throw new Error(`balance.personality.autonomy.activities.${id} falta`);
  }
  for (const [id, a] of Object.entries(acts)) {
    if (!['rest', 'play_alone', 'explore', 'socialize', 'wait_owner', 'practice_trick', 'tidy_habitat'].includes(id)) {
      throw new Error(`balance.personality.autonomy.activities: actividad desconocida ${id}`);
    }
    if (!(a.base > 0) || typeof a.energy !== 'number' || typeof a.happiness !== 'number') throw new Error(`balance.personality.autonomy.activities.${id} inválida`);
  }

  // 1c-sexies. Trucos y deseos (spec 37 §4.5 y §4.6)
  const tricks = pers.tricks;
  if (tricks) {
    const where = 'balance.personality.tricks';
    if (!Number.isInteger(tricks.teachDailyCap) || tricks.teachDailyCap < 1) throw new Error(`${where}.teachDailyCap inválido`);
    const entries = Object.entries(tricks.catalog ?? {});
    if (entries.length === 0) throw new Error(`${where}.catalog vacío`);
    for (const [id, t] of entries) {
      if (!t.name || !Number.isInteger(t.practices) || t.practices < 1) throw new Error(`${where}.catalog.${id} inválido`);
      for (const [k, v] of Object.entries(t.minDims ?? {})) {
        if (!PERSONALITY_DIMS.includes(k) || typeof v !== 'number') throw new Error(`${where}.catalog.${id}.minDims.${k} inválido`);
      }
    }
    // Cualquier Pockai debe poder aprender al menos uno
    if (!entries.some(([, t]) => !t.minDims)) throw new Error(`${where}.catalog: hace falta un truco sin requisitos`);
    console.log(`✓ balance.json: ${entries.length} trucos validados`);
  }
  const wishes = pers.wishes;
  if (wishes) {
    const where = 'balance.personality.wishes';
    const WISH_IDS = ['go_explore', 'see_friend', 'show_find', 'be_cuddled', 'learn_trick'];
    if (!Number.isInteger(wishes.maxActive) || wishes.maxActive < 1 || wishes.maxActive > 2) throw new Error(`${where}.maxActive debe ser 1 o 2`);
    if (!Number.isInteger(wishes.showEveryTurns) || wishes.showEveryTurns < 1) throw new Error(`${where}.showEveryTurns inválido`);
    if (!(wishes.cooldownHours > 0) || !(wishes.happinessOnFulfil >= 0 && wishes.happinessOnFulfil <= 5) || !(wishes.minScore >= 0)) throw new Error(`${where}: cooldownHours, happinessOnFulfil o minScore inválidos`);
    for (const id of WISH_IDS) {
      const w = wishes.catalog?.[id];
      if (!w || !(w.base > 0)) throw new Error(`${where}.catalog.${id} falta o no tiene base`);
      for (const [k, v] of Object.entries(w.weights ?? {})) {
        if (!PERSONALITY_DIMS.includes(k) || typeof v !== 'number') throw new Error(`${where}.catalog.${id}.weights.${k} inválido`);
      }
      if (w.activityBoost !== undefined && !(w.activityBoost >= 1 && w.activityBoost <= 3)) throw new Error(`${where}.catalog.${id}.activityBoost debe estar en 1-3`);
    }
    for (const id of Object.keys(wishes.catalog ?? {})) if (!WISH_IDS.includes(id)) throw new Error(`${where}.catalog: deseo desconocido ${id}`);
    console.log(`✓ balance.json: ${WISH_IDS.length} deseos validados`);
  }

  // 1c-quater. Vida social: etapas de relación y escenas entre dos Pockai
  const social = pers.social;
  if (social) {
    const where = 'balance.personality.social';
    const STAGE_IDS = ['stranger', 'acquaintance', 'friend', 'best_friend'];
    const SCENE_IDS = ['greet', 'explore_together', 'play_tag', 'share_food', 'nap_together', 'squabble', 'make_up', 'give_gift'];
    const unit = (v) => typeof v === 'number' && v >= 0 && v <= 1;
    const st = social.stages ?? {};
    if (!unit(st.acquaintance?.familiarity)) throw new Error(`${where}.stages.acquaintance inválido`);
    for (const id of ['friend', 'best_friend']) {
      const s = st[id];
      if (!s || !unit(s.familiarity) || typeof s.enterValence !== 'number' || typeof s.exitValence !== 'number') throw new Error(`${where}.stages.${id} inválido`);
      // Sin margen entre entrar y salir, una relación en el borde cambiaría de etapa en cada encuentro
      if (!(s.exitValence < s.enterValence)) throw new Error(`${where}.stages.${id}: exitValence debe ser menor que enterValence`);
    }
    if (!(st.acquaintance.familiarity < st.friend.familiarity && st.friend.familiarity < st.best_friend.familiarity)) {
      throw new Error(`${where}.stages: la familiaridad debe crecer de una etapa a la siguiente`);
    }
    if (!(social.valenceFloor < 0 && social.valenceFloor >= -1)) throw new Error(`${where}.valenceFloor debe estar en [-1, 0)`);
    const sc = social.scene ?? {};
    if (!(sc.slotMs >= 30000) || !Number.isInteger(sc.maxEffectScenesPerVisit) || sc.maxEffectScenesPerVisit < 1 || !(sc.repeatFactor >= 0 && sc.repeatFactor <= 1)) {
      throw new Error(`${where}.scene inválido`);
    }
    for (const id of SCENE_IDS) {
      const s = social.scenes?.[id];
      const at = `${where}.scenes.${id}`;
      if (!s) throw new Error(`${at} falta`);
      if (!(typeof s.base === 'number' && s.base > 0)) throw new Error(`${at}.base debe ser > 0`);
      if (!(typeof s.delta === 'number' && Math.abs(s.delta) <= 0.3)) throw new Error(`${at}.delta debe estar en [-0.3, 0.3]`);
      for (const [k, v] of Object.entries(s.weights ?? {})) {
        if (!PERSONALITY_DIMS.includes(k) || typeof v !== 'number') throw new Error(`${at}.weights.${k} inválido`);
      }
      for (const k of ['minStage', 'maxStage']) if (s[k] !== undefined && !STAGE_IDS.includes(s[k])) throw new Error(`${at}.${k} desconocida`);
      if (s.after !== undefined && !SCENE_IDS.includes(s.after)) throw new Error(`${at}.after desconocida`);
    }
    for (const id of Object.keys(social.scenes ?? {})) if (!SCENE_IDS.includes(id)) throw new Error(`${where}.scenes: escena desconocida ${id}`);
    // Siempre debe quedar una escena sin condiciones, para cualquier pareja y cualquier ranura
    if (!SCENE_IDS.some((id) => { const s = social.scenes[id]; return !s.minStage && !s.maxStage && !s.after && !s.firstSlotOnly && s.minEnergy === undefined && s.maxEnergy === undefined && s.minTemper === undefined && !s.requiresFind; })) {
      throw new Error(`${where}.scenes: hace falta una escena sin condiciones`);
    }
    // Rumores: lista blanca de orígenes. Lo privado no puede colarse por configuración.
    const ru = social.rumors;
    if (ru) {
      const SHAREABLE = ['find', 'adventure', 'event'];
      if (!Array.isArray(ru.kinds)) throw new Error(`${where}.rumors.kinds debe ser una lista`);
      for (const k of ru.kinds) {
        if (!SHAREABLE.includes(k)) throw new Error(`${where}.rumors.kinds: «${k}» no se puede compartir entre Pockai (permitidos: ${SHAREABLE.join(', ')})`);
      }
      if (!unit(ru.chance)) throw new Error(`${where}.rumors.chance debe estar en [0, 1]`);
      if (!(ru.maxAgeDays >= 1 && ru.maxAgeDays <= 30)) throw new Error(`${where}.rumors.maxAgeDays debe estar en [1, 30]`);
      // Un rumor pesa menos que lo vivido, pero tiene que llegar a guardarse
      if (!(ru.importance >= (pers.memory?.minImportanceToStore ?? 0) && ru.importance <= 0.5)) {
        throw new Error(`${where}.rumors.importance debe estar entre memory.minImportanceToStore y 0.5`);
      }
    }
    // Menú del entrenador que visita: topes y efectos acotados para un tercero
    const vi = social.visitor;
    if (vi) {
      const at = `${where}.visitor`;
      const OPTS = ['greet', 'pet', 'treat', 'play', 'ask'];
      if (!(Number.isInteger(vi.maxPerVisit) && vi.maxPerVisit >= 1 && vi.maxPerVisit <= 10)) throw new Error(`${at}.maxPerVisit debe ser un entero en [1, 10]`);
      if (!(Number.isInteger(vi.dailyEffects) && vi.dailyEffects >= 0 && vi.dailyEffects <= vi.maxPerVisit)) throw new Error(`${at}.dailyEffects debe ser un entero en [0, maxPerVisit]`);
      for (const k of ['shyBelow', 'aloofBelow', 'minEnergyToPlay']) if (!(vi[k] >= 0 && vi[k] <= 100)) throw new Error(`${at}.${k} debe estar en [0, 100]`);
      if (!(vi.treat?.happiness >= 0 && vi.treat.happiness <= 10 && vi.treat?.hunger >= 0 && vi.treat.hunger <= 15)) throw new Error(`${at}.treat fuera de rango`);
      // Cuánto mejora la relación cada opción lo dice el grafo (dialogues.json → visit, comando
      // `feel`). Sin opciones negativas: un visitante no puede empeorar la relación con un Pockai ajeno.
      if (vi.deltas !== undefined) throw new Error(`${at}.deltas ya no se usa: los efectos van en dialogues.json`);
      const visit = readJson('shared/game-data/dialogues.json').conversations?.visit;
      for (const node of Object.values(visit?.nodes ?? {})) {
        for (const t of [...(node.choices ?? []), ...(Array.isArray(node.next) ? node.next : [])]) {
          for (const cmd of t.cmd ?? []) {
            if (cmd.startsWith('feel:') && !(Number(cmd.slice(5)) >= 0 && Number(cmd.slice(5)) <= 0.15)) {
              throw new Error(`dialogues.json › visit: «${cmd}» debe estar entre 0 y 0,15 (un visitante no puede empeorar la relación)`);
            }
          }
        }
      }
      // La deriva que provoca un tercero es, como mucho, la mitad de la del propio entrenador
      const owner = { greet: 'chat', pet: 'chat', ask: 'chat', treat: 'fed', play: 'minigame' };
      for (const o of OPTS) {
        const ev = pers.evolution?.events?.[`visitor_${o}`];
        if (!ev) throw new Error(`balance.personality.evolution.events.visitor_${o} falta`);
        const cap = Math.max(...Object.values(pers.evolution.events[owner[o]] ?? {}).map((x) => Math.abs(x)), 0) / 2;
        for (const [d, x] of Object.entries(ev)) {
          if (Math.abs(x) > cap + 1e-9) throw new Error(`balance.personality.evolution.events.visitor_${o}.${d}: supera la mitad de lo que mueve el entrenador (${cap})`);
        }
      }
    }
    const icap = pers.intelligence?.dailyChatCap;
    if (pers.intelligence && !(Number.isInteger(icap) && icap >= 1 && icap <= 1000)) throw new Error('balance.personality.intelligence.dailyChatCap debe ser un entero en [1, 1000]');
    const slm = pers.memory?.sinceLastMax;
    if (slm !== undefined && !(Number.isInteger(slm) && slm >= 0 && slm <= 4)) throw new Error('balance.personality.memory.sinceLastMax debe ser un entero en [0, 4]');
    console.log(`✓ balance.json: vida social (${SCENE_IDS.length} escenas, 4 etapas) validada`);
  }

  // 1c-ter. Sala del hábitat: acciones con pesos por dimensión y empuje por necesidades
  const roomCfg = pers.room;
  if (roomCfg) {
    const where = 'balance.personality.room';
    const INTERACTIONS = ['sleep', 'eat', 'play', 'bathe', 'sit', 'listen'];
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
// Disponibilidad (spec 41): shop | drop | hidden. Lo oculto solo lo da el admin: nunca cae.
{
  const AVAIL = ['shop', 'drop', 'hidden'];
  const byId = new Map(foods.map((f) => [f.id, f]));
  const sources = [];
  for (const [type, chest] of Object.entries(balance.chests ?? {})) for (const d of chest?.dropTable ?? []) sources.push([`chests.${type}`, d.itemId]);
  for (const [id, g] of Object.entries(balance.minigames?.games ?? {})) if (g?.itemDrop?.itemId) sources.push([`minigames.${id}.itemDrop`, g.itemDrop.itemId]);
  for (const id of balance.personality?.autonomy?.itemFind?.items ?? []) sources.push(['autonomy.itemFind', id]);
  for (const [src, list] of Object.entries(balance.activityDrops?.sources ?? {})) {
    for (const d of list ?? []) {
      sources.push([`activityDrops.${src}`, d.itemId]);
      if (!(d.chance > 0 && d.chance <= 1)) throw new Error(`activityDrops.${src}: chance de ${d.itemId} debe estar en (0, 1]`);
    }
  }
  for (const [id, cap] of Object.entries(balance.activityDrops?.dailyCaps ?? {})) {
    if (!byId.has(id)) throw new Error(`activityDrops.dailyCaps: ${id} no existe en foods.json`);
    if (!(Number.isInteger(cap) && cap >= 0)) throw new Error(`activityDrops.dailyCaps.${id} debe ser un entero ≥ 0`);
  }
  for (const [where, id] of sources) {
    const f = byId.get(id);
    if (!f) throw new Error(`${where}: ${id} no existe en foods.json`);
    if (f.availability === 'hidden') throw new Error(`${where}: ${id} es un objeto oculto (solo admin) y no puede caer`);
  }
  for (const f of foods) {
    const av = f.availability ?? 'shop';
    if (!AVAIL.includes(av)) throw new Error(`${f.id}: availability "${av}" no es shop, drop ni hidden`);
    if (av !== 'shop' && (f.priceCoins > 0 || f.priceGems > 0)) throw new Error(`${f.id}: un objeto ${av} no se vende y debe tener precio 0`);
    if (av === 'drop' && !sources.some(([, id]) => id === f.id)) console.warn(`⚠ ${f.id} es solo drop pero no cae en ninguna parte`);
    if (f.kind === 'level_up' && !(Number.isInteger(f.effects?.levels) && f.effects.levels >= 1)) throw new Error(`${f.id}: level_up necesita effects.levels entero ≥ 1`);
  }
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

// 4c. Aventura diaria: configuración, escenarios por capas y semillas (mismas reglas que
// backend/src/modules/game-data/story-data.schemas.ts)
{
  const cfg = readJson('shared/game-data/stories.json');
  const loc = readJson('shared/game-data/story-locations.json');
  const seeds = readJson('shared/game-data/story-seeds.json');
  const SLOTS = ['bg', 'l1', 'l2', 'l3'];
  const LIFE = ['none', 'dust', 'firefly', 'stardust', 'ember'];
  const where = 'stories.json';
  if (!Number.isInteger(cfg.scenesPerStory) || cfg.scenesPerStory < 1) throw new Error(`${where}: scenesPerStory inválido`);
  if (!(cfg.choicesPerScene?.min >= 2 && cfg.choicesPerScene.max >= cfg.choicesPerScene.min)) throw new Error(`${where}: choicesPerScene inválido`);
  const bucket = cfg.bucket || {};
  if (!Number.isInteger(bucket.storiesPerDay) || bucket.storiesPerDay < 1) throw new Error(`${where}: bucket.storiesPerDay inválido`);
  if (!(bucket.generateAtHour >= 0 && bucket.aiDeadlineHour <= 23 && bucket.aiDeadlineHour > bucket.generateAtHour)) {
    throw new Error(`${where}: bucket.aiDeadlineHour debe ser posterior a generateAtHour (0-23)`);
  }
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: bucket.timezone });
  } catch {
    throw new Error(`${where}: bucket.timezone '${bucket.timezone}' no es una zona horaria IANA`);
  }
  if (!(cfg.outcome?.winAt > cfg.outcome?.partialAt)) throw new Error(`${where}: outcome.winAt debe ser mayor que partialAt`);
  for (const r of ['win', 'partial', 'lose']) {
    for (const k of ['xp', 'coins', 'happiness']) {
      if (!Number.isInteger(cfg.rewards?.[r]?.[k]) || cfg.rewards[r][k] < 0) throw new Error(`${where}: rewards.${r}.${k} inválido`);
    }
  }
  // Los efectos de evento deben existir en el registro de @pockai/scene
  const effectsDir = path.resolve(__dirname, '..', 'shared/scene/src/effects');
  const effectIds = new Set();
  for (const f of fs.readdirSync(effectsDir).filter((n) => n.endsWith('.ts') && !n.endsWith('.spec.ts'))) {
    for (const m of fs.readFileSync(path.join(effectsDir, f), 'utf8').matchAll(/^\s+id: '([a-z-]+)'/gm)) effectIds.add(m[1]);
  }
  for (const fx of cfg.eventFx ?? []) if (!effectIds.has(fx)) throw new Error(`${where}: eventFx '${fx}' no es un efecto de shared/scene`);

  const layerSlot = new Map();
  for (const l of loc.layers ?? []) {
    if (layerSlot.has(l.id)) throw new Error(`story-locations.json: capa duplicada '${l.id}'`);
    if (!SLOTS.includes(l.slot)) throw new Error(`story-locations.json: la capa '${l.id}' tiene una ranura desconocida '${l.slot}'`);
    if (!/^#[0-9a-fA-F]{6}$/.test(l.color)) throw new Error(`story-locations.json: color inválido en la capa '${l.id}'`);
    if (l.building && l.slot !== 'l1') throw new Error(`story-locations.json: la capa '${l.id}' es edificio y debe ir en l1`);
    layerSlot.set(l.id, l.slot);
  }
  for (const slot of SLOTS) {
    if (![...layerSlot.values()].includes(slot)) throw new Error(`story-locations.json: ninguna capa en la ranura '${slot}'`);
  }
  const buildings = new Set((loc.layers ?? []).filter((l) => l.building).map((l) => l.id));
  const checkSet = (at, set) => {
    for (const slot of SLOTS) {
      if (layerSlot.get(set?.[slot]) !== slot) throw new Error(`${at}: '${set?.[slot]}' no es una capa de la ranura ${slot}`);
    }
  };
  const locationIds = new Set();
  for (const l of loc.locations ?? []) {
    if (locationIds.has(l.id)) throw new Error(`story-locations.json: localización duplicada '${l.id}'`);
    locationIds.add(l.id);
    checkSet(`localización ${l.id}`, l.layers);
    if (!['open', 'building'].includes(l.kind)) throw new Error(`localización ${l.id}: kind inválido`);
    if ((l.kind === 'building') !== buildings.has(l.layers.l1)) throw new Error(`localización ${l.id}: kind '${l.kind}' no cuadra con su capa l1`);
    if (!ELEMENTS.has(l.flow)) throw new Error(`localización ${l.id}: flow desconocido '${l.flow}'`);
    if (!LIFE.includes(l.life)) throw new Error(`localización ${l.id}: life desconocido '${l.life}'`);
    if (!(Array.isArray(l.ground) && l.ground[0] >= 0 && l.ground[1] <= 1 && l.ground[1] > l.ground[0])) throw new Error(`localización ${l.id}: ground inválido`);
  }
  for (const kind of ['open', 'building']) {
    if (!(loc.locations ?? []).some((l) => l.kind === kind)) throw new Error(`story-locations.json: falta alguna localización '${kind}'`);
  }
  for (const [id, s] of Object.entries(loc.screens ?? {})) {
    checkSet(`pantalla ${id}`, s.layers);
    if (!ELEMENTS.has(s.flow) || !LIFE.includes(s.life)) throw new Error(`pantalla ${id}: flow/life inválido`);
  }
  for (const id of ['arena', 'raid', 'tournament', 'training', 'kitchen']) {
    if (!loc.screens?.[id]) throw new Error(`story-locations.json: falta la pantalla '${id}'`);
  }

  const seedIds = new Set();
  const txt = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  for (const s of seeds.stories ?? []) {
    const at = `semilla ${s.id}`;
    if (seedIds.has(s.id)) throw new Error(`story-seeds.json: semilla duplicada '${s.id}'`);
    seedIds.add(s.id);
    if (!txt(s.title, cfg.text.titleMax) || !txt(s.synopsis, cfg.text.synopsisMax)) throw new Error(`${at}: título o sinopsis inválidos`);
    if (!Array.isArray(s.scenes) || s.scenes.length !== cfg.scenesPerStory) throw new Error(`${at}: debe tener ${cfg.scenesPerStory} escenas`);
    s.scenes.forEach((sc, i) => {
      const sat = `${at}, escena ${i + 1}`;
      if (!locationIds.has(sc.locationId)) throw new Error(`${sat}: localización desconocida '${sc.locationId}'`);
      if (!txt(sc.narration, cfg.text.narrationMax)) throw new Error(`${sat}: narración inválida`);
      if (!cfg.eventKinds.includes(sc.event?.kind) || !txt(sc.event?.text, cfg.text.eventMax)) throw new Error(`${sat}: evento inválido`);
      if (sc.event.fx !== undefined && !cfg.eventFx.includes(sc.event.fx)) throw new Error(`${sat}: fx '${sc.event.fx}' no está en eventFx`);
      const cs = sc.choices;
      if (!Array.isArray(cs) || cs.length < cfg.choicesPerScene.min || cs.length > cfg.choicesPerScene.max) throw new Error(`${sat}: número de opciones inválido`);
      for (const c of cs) {
        if (!txt(c.label, cfg.text.labelMax) || !txt(c.consequence, cfg.text.consequenceMax) || !txt(c.canonLine, cfg.text.canonLineMax)) {
          throw new Error(`${sat}: opción '${c.label}' con textos inválidos o demasiado largos`);
        }
        if (!cfg.approaches.includes(c.approach)) throw new Error(`${sat}: approach desconocido '${c.approach}'`);
        if (![0, 1, 2].includes(c.score)) throw new Error(`${sat}: score debe ser 0, 1 o 2`);
      }
      if (!cs.some((c) => c.score === 2)) throw new Error(`${sat}: hace falta una opción con score 2`);
    });
  }
  if (seedIds.size < bucket.storiesPerDay) throw new Error(`story-seeds.json: hacen falta al menos ${bucket.storiesPerDay} semillas`);
  console.log(`✓ aventura diaria: ${layerSlot.size} capas, ${locationIds.size} localizaciones y ${seedIds.size} semillas validadas`);
}

// 4y. Usar un mueble del hábitat: efecto pequeño y con tope (no es una vía para criar sin cuidar)
{
  const use = balance.habitat?.use;
  if (use) {
    const VITALS = ['hunger', 'happiness', 'energy', 'hygiene'];
    const USES = ['eat', 'bathe', 'sit', 'sleep', 'play', 'listen'];
    if (!(Number.isInteger(use.dailyCap) && use.dailyCap >= 0 && use.dailyCap <= 12)) throw new Error('balance.habitat.use.dailyCap debe ser un entero en [0, 12]');
    if (!(use.cooldownSeconds >= 30)) throw new Error('balance.habitat.use.cooldownSeconds debe ser al menos 30');
    for (const [id, fx] of Object.entries(use.effects ?? {})) {
      if (!USES.includes(id)) throw new Error(`balance.habitat.use.effects: uso desconocido ${id}`);
      for (const [vital, n] of Object.entries(fx)) {
        if (!VITALS.includes(vital) || !(typeof n === 'number' && Math.abs(n) <= 5)) throw new Error(`balance.habitat.use.effects.${id}.${vital} inválido (vital conocido, de -5 a 5)`);
      }
      if (!balance.personality?.evolution?.events?.[`furniture_${id}`]) throw new Error(`balance.personality.evolution.events.furniture_${id} falta`);
    }
    console.log(`✓ balance.json: uso de muebles (${Object.keys(use.effects ?? {}).length} usos, tope ${use.dailyCap} al día) validado`);
  }
}

// 4z. Diálogos por datos y textos (spec 37, lote 5)
{
  const { validateDialogues } = require('./lib/validate-dialogues');
  const stringsDir = path.resolve(__dirname, '..', 'shared/game-data/strings');
  const strings = {};
  for (const file of fs.readdirSync(stringsDir).filter((f) => f.endsWith('.json')).sort((x, y) => (x === 'es.json' ? -1 : y === 'es.json' ? 1 : x.localeCompare(y)))) {
    strings[file.replace(/\.json$/, '')] = readJson(`shared/game-data/strings/${file}`);
  }
  const pers = balance.personality ?? {};
  const errors = validateDialogues({
    dialogues: readJson('shared/game-data/dialogues.json'),
    strings,
    keywords: Object.values(pers.dimensions ?? {}).flatMap((d) => (d.bands ?? []).map((band) => band.keyword)),
    behaviors: Object.keys(pers.behavior?.catalog ?? {}),
    wishes: Object.keys(pers.wishes?.catalog ?? {}),
    // Los mismos nombres que acepta backend/src/modules/mind/strings.ts
    placeholders: ['pet', 'friend', 'visitor', 'owner', 'item', 'hint', 'mood', 'story', 'trick'],
  });
  if (errors.length) throw new Error(`Diálogos o textos inválidos:\n  - ${errors.join('\n  - ')}`);

  // Rutinas de la vida autónoma: momentos del día e hilo entre una hora y la siguiente
  const rut = pers.autonomy?.routine;
  if (rut) {
    const at = 'balance.personality.autonomy.routine';
    const PHASES = ['morning', 'afternoon', 'evening', 'night'];
    const known = Object.keys(pers.autonomy.activities ?? {});
    const starts = PHASES.map((ph) => rut.phaseStarts?.[ph]);
    if (!starts.every((h) => Number.isInteger(h) && h >= 0 && h <= 23)) throw new Error(`${at}.phaseStarts: cada momento necesita una hora de 0 a 23`);
    for (let i = 1; i < starts.length; i++) if (!(starts[i] > starts[i - 1])) throw new Error(`${at}.phaseStarts: las horas deben ir en orden (mañana < tarde < anochecer < noche)`);
    for (const ph of Object.keys(rut.phaseFactors ?? {})) if (!PHASES.includes(ph)) throw new Error(`${at}.phaseFactors: momento desconocido ${ph}`);
    for (const ph of PHASES) {
      for (const [a, f] of Object.entries(rut.phaseFactors?.[ph] ?? {})) {
        if (!known.includes(a)) throw new Error(`${at}.phaseFactors.${ph}: actividad desconocida ${a}`);
        // Inclina, no prohíbe: nada llega a cero ni lo acapara todo
        if (!(f >= 0.05 && f <= 10)) throw new Error(`${at}.phaseFactors.${ph}.${a} debe estar entre 0,05 y 10`);
      }
    }
    const mo = rut.momentum ?? {};
    if (!(mo.stay >= 1 && mo.stay <= 3)) throw new Error(`${at}.momentum.stay debe estar entre 1 y 3`);
    if (!(mo.tired > 0 && mo.tired <= 1)) throw new Error(`${at}.momentum.tired debe estar en (0, 1]`);
    if (!(Number.isInteger(mo.maxStreak) && mo.maxStreak >= 2 && mo.maxStreak <= 12)) throw new Error(`${at}.momentum.maxStreak debe ser un entero de 2 a 12`);
    for (const a of mo.noFatigue ?? []) if (!known.includes(a)) throw new Error(`${at}.momentum.noFatigue: actividad desconocida ${a}`);
    for (const [prev, nexts] of Object.entries(rut.after ?? {})) {
      if (!known.includes(prev)) throw new Error(`${at}.after: actividad desconocida ${prev}`);
      for (const [a, f] of Object.entries(nexts)) {
        if (!known.includes(a) || a === prev) throw new Error(`${at}.after.${prev}: actividad inválida ${a}`);
        if (!(f >= 0.2 && f <= 3)) throw new Error(`${at}.after.${prev}.${a} debe estar entre 0,2 y 3`);
      }
    }
    if (!(Number.isInteger(rut.longFrom) && rut.longFrom >= 2 && rut.longFrom <= mo.maxStreak)) throw new Error(`${at}.longFrom debe ser un entero entre 2 y momentum.maxStreak`);
    for (const lang of Object.keys(strings)) {
      for (const a of known) if (typeof strings[lang][`AUTO_LONG_${a.toUpperCase()}_1`] !== 'string') throw new Error(`strings/${lang}.json: falta AUTO_LONG_${a.toUpperCase()}_1 (un buen rato seguido)`);
    }
    console.log(`✓ balance.json: rutinas de la vida autónoma (${PHASES.length} momentos del día, ${Object.keys(rut.after ?? {}).length} encadenamientos) validadas`);
  }

  // Consolidación de la memoria: cada grupo que se pliega necesita su frase de resumen
  const cons = pers.memory?.consolidation;
  if (cons) {
    const at = 'balance.personality.memory.consolidation';
    const groups = new Set();
    for (const [kind, by] of Object.entries(cons.kinds ?? {})) {
      if (!['subject', 'kind'].includes(by)) throw new Error(`${at}.kinds.${kind} debe ser subject o kind`);
      // Lo nacido del chat no se pliega sin leerlo: resumirlo bien es cosa de un modelo
      if (['summary', 'event', 'fact', 'habit', 'relation', 'rumor'].includes(kind)) throw new Error(`${at}.kinds: «${kind}» no se puede plegar`);
      for (const g of by === 'subject' ? ['PET', 'USER'] : [kind.toUpperCase()]) groups.add(g);
    }
    if (!groups.size) throw new Error(`${at}.kinds no puede estar vacío`);
    if (!(Number.isInteger(cons.minCount) && cons.minCount >= 2)) throw new Error(`${at}.minCount debe ser un entero ≥ 2`);
    if (!(Number.isInteger(cons.manyFrom) && cons.manyFrom > cons.minCount)) throw new Error(`${at}.manyFrom debe ser mayor que minCount`);
    if (!(Number.isInteger(cons.maxDigests) && cons.maxDigests >= 4 && cons.maxDigests <= 100)) throw new Error(`${at}.maxDigests debe ser un entero de 4 a 100`);
    if (!(cons.tone?.good > 0 && cons.tone.bad < 0)) throw new Error(`${at}.tone: good > 0 y bad < 0`);
    const imp = cons.importance ?? {};
    if (!(imp.base >= (pers.memory.minImportanceToStore ?? 0) && imp.max <= 1 && imp.base <= imp.max && imp.perEpisode >= 0)) throw new Error(`${at}.importance inválida`);
    for (const lang of Object.keys(strings)) {
      for (const g of groups) for (const amount of ['SOME', 'MANY']) if (typeof strings[lang][`DIGEST_${g}_${amount}`] !== 'string') throw new Error(`strings/${lang}.json: falta DIGEST_${g}_${amount} (resumen de memoria)`);
    }
    console.log(`✓ balance.json: consolidación de memoria (${Object.keys(cons.kinds).length} tipos, ${groups.size} grupos con frase) validada`);
  }
  console.log(`✓ diálogos: ${Object.keys(readJson('shared/game-data/dialogues.json').conversations).length} conversación(es) y ${Object.keys(strings.es ?? {}).length} textos en ${Object.keys(strings).join(', ')} validados`);
}

// 4zz. Frases con variables y estado de ánimo
{
  const { validatePhrases } = require('./lib/validate-phrases');
  const phrases = readJson('shared/game-data/phrases.json');
  const pers = balance.personality ?? {};
  const errors = validatePhrases({ phrases, langs: ['es', 'en'], dims: Object.keys(pers.dimensions ?? {}) });
  if (errors.length) throw new Error(`Frases inválidas:\n  - ${errors.join('\n  - ')}`);
  console.log(`✓ phrases.json: ${phrases.phrases.length} frases, ${Object.keys(phrases.variables).length} variables y ${Object.keys(phrases.facts).length} datos del entrenador validados`);

  // Iniciativa: tres niveles de insistencia y prioridad de tipos de frase
  const ini = pers.initiative;
  if (ini) {
    const at = 'balance.personality.initiative';
    const LEVELS = ['quiet', 'normal', 'chatty'];
    if (!LEVELS.includes(ini.defaultLevel)) throw new Error(`${at}.defaultLevel desconocido`);
    for (const id of LEVELS) {
      const l = ini.levels?.[id];
      if (!l || !(l.desktopMinutes >= 2) || !(Number.isInteger(l.mobilePerDay) && l.mobilePerDay >= 0 && l.mobilePerDay <= 12)) throw new Error(`${at}.levels.${id} inválido (desktopMinutes ≥ 2, mobilePerDay entero de 0 a 12)`);
    }
    for (const id of Object.keys(ini.levels ?? {})) if (!LEVELS.includes(id)) throw new Error(`${at}.levels: nivel desconocido ${id}`);
    // De más callado a más hablador: nunca al revés
    if (!(ini.levels.chatty.desktopMinutes <= ini.levels.normal.desktopMinutes && ini.levels.chatty.mobilePerDay >= ini.levels.normal.mobilePerDay && ini.levels.normal.mobilePerDay >= ini.levels.quiet.mobilePerDay)) {
      throw new Error(`${at}.levels: «chatty» debe hablar al menos tanto como «normal», y «normal» como «quiet»`);
    }
    const pw = ini.personality ?? {};
    if (!(pw.min > 0 && pw.min <= 1 && pw.max >= 1 && pw.max <= 3)) throw new Error(`${at}.personality: min en (0, 1] y max en [1, 3]`);
    for (const d of Object.keys(pw.weights ?? {})) if (!Object.keys(pers.dimensions ?? {}).includes(d)) throw new Error(`${at}.personality.weights: dimensión desconocida ${d}`);
    const q = ini.quietHours ?? {};
    for (const k of ['from', 'to']) if (!(Number.isInteger(q[k]) && q[k] >= 0 && q[k] <= 23)) throw new Error(`${at}.quietHours.${k} debe ser una hora de 0 a 23`);
    if (!(ini.backAfterMinutes >= 5)) throw new Error(`${at}.backAfterMinutes debe ser al menos 5`);
    const kinds = new Set(phrases.kinds);
    const listed = (ini.priority ?? []).flat();
    for (const k of listed) if (!kinds.has(k)) throw new Error(`${at}.priority: tipo de frase desconocido ${k}`);
    for (const k of kinds) if (!listed.includes(k)) throw new Error(`${at}.priority: falta el tipo de frase ${k} (nunca se diría)`);
    if (new Set(listed).size !== listed.length) throw new Error(`${at}.priority: tipo repetido`);
    console.log(`✓ balance.json: iniciativa (${LEVELS.length} niveles, ${ini.priority.length} prioridades) validada`);
  }

  // Aprendizaje: inclina la balanza entre conductas del escritorio, siempre acotado
  const learn = pers.learning;
  if (learn) {
    const at = 'balance.personality.learning';
    if (!(learn.rate > 0 && learn.rate <= 0.5)) throw new Error(`${at}.rate debe estar en (0, 0,5]`);
    if (!(learn.creditWindowMs >= 1000 && learn.creditWindowMs <= 30000)) throw new Error(`${at}.creditWindowMs debe estar entre 1000 y 30000`);
    if (!(learn.halfLifeDays >= 1 && learn.halfLifeDays <= 365)) throw new Error(`${at}.halfLifeDays debe estar entre 1 y 365`);
    // Nada desaparece del todo ni lo acapara todo
    if (!(learn.factor?.min >= 0.3 && learn.factor.min < 1 && learn.factor.max > 1 && learn.factor.max <= 2)) throw new Error(`${at}.factor: min en [0,3, 1) y max en (1, 2]`);
    if (!(Number.isInteger(learn.maxEntries) && learn.maxEntries >= 5)) throw new Error(`${at}.maxEntries debe ser un entero ≥ 5`);
    if (!(Number.isInteger(learn.dailyCap) && learn.dailyCap >= 1 && learn.dailyCap <= 200)) throw new Error(`${at}.dailyCap debe ser un entero de 1 a 200`);
    const signals = Object.entries(learn.signals ?? {});
    for (const [id, v] of signals) if (!(typeof v === 'number' && v !== 0 && Math.abs(v) <= 1)) throw new Error(`${at}.signals.${id} debe estar en [-1, 1] y no ser 0`);
    if (!signals.some(([, v]) => v > 0)) throw new Error(`${at}.signals: hace falta al menos un gesto que premie`);
    console.log(`✓ balance.json: aprendizaje (${signals.length} gestos, factor ${learn.factor.min}–${learn.factor.max}) validado`);
  }

  const feeling = pers.feeling;
  if (feeling) {
    if (!(feeling.halfLifeMinutes >= 5 && feeling.halfLifeMinutes <= 1440)) throw new Error('balance.personality.feeling.halfLifeMinutes debe estar entre 5 y 1440');
    const l = feeling.labels ?? {};
    if (!(l.low < 0 && l.high > 0 && l.sleepy < l.excited && l.sleepy >= 0 && l.excited <= 1)) throw new Error('balance.personality.feeling.labels inválido');
    for (const [ev, push] of Object.entries(feeling.events ?? {})) {
      // Solo acontecimientos que el motor de evolución conoce: un nombre mal escrito no haría nada
      if (!pers.evolution?.events?.[ev]) throw new Error(`balance.personality.feeling.events.${ev}: no es un acontecimiento de evolution.events`);
      for (const [k, n] of Object.entries(push)) {
        if (!['valence', 'arousal'].includes(k) || !(typeof n === 'number' && Math.abs(n) <= 0.5)) throw new Error(`balance.personality.feeling.events.${ev}.${k} inválido (de -0,5 a 0,5)`);
      }
    }
    console.log(`✓ balance.json: estado de ánimo (${Object.keys(feeling.events ?? {}).length} acontecimientos) validado`);
  }
}

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

// Recetas de cocina (spec 15): se cocina con comida de foods.json.
{
  const recipes = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'shared', 'game-data', 'recipes.json'), 'utf8'));
  const foods = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'shared', 'game-data', 'foods.json'), 'utf8'));
  const edible = new Set(foods.filter((f) => f.kind === 'food').map((f) => f.id));
  const seen = new Set();
  for (const r of recipes) {
    const bad = (msg) => {
      console.error(`❌ recipes.json [${r.id}]: ${msg}`);
      process.exit(1);
    };
    if (!/^[a-z][a-z0-9_]*$/.test(r.id || '') || seen.has(r.id)) bad('id inválido o repetido');
    seen.add(r.id);
    if (!r.name || !(r.difficulty >= 1 && r.difficulty <= 5) || !(r.unlockLevel >= 1)) bad('faltan name, difficulty (1–5) o unlockLevel');
    if (r.description !== undefined && (typeof r.description !== 'string' || !r.description.trim())) bad('description vacía');
    // El Menú del día (una receta por día de la semana, UTC) puede llevar hasta 6 ingredientes y un
    // buff a todas las stats; las normales, 3 o 4 y una stat.
    const maxIng = r.dailyMenu ? 6 : 4;
    if (!Array.isArray(r.ingredients) || r.ingredients.length < 3 || r.ingredients.length > maxIng) bad(`lleva de 3 a ${maxIng} ingredientes`);
    if (new Set(r.ingredients).size !== r.ingredients.length) bad('repite un ingrediente');
    for (const ing of r.ingredients) if (!edible.has(ing)) bad(`el ingrediente '${ing}' no es una comida de foods.json`);
    const stats = r.dailyMenu ? ['atk', 'def', 'esp', 'vel', 'all'] : ['atk', 'def', 'esp', 'vel'];
    if (!stats.includes(r.buff?.stat) || !(r.buff?.value > 0)) bad('buff inválido');
    if (r.dailyMenu !== undefined && r.dailyMenu !== true) bad('dailyMenu solo puede ser true');
    if (r.dailyMenu && !(Number.isInteger(r.weekday) && r.weekday >= 0 && r.weekday <= 6)) bad('un menú del día necesita weekday 0–6 (0 = domingo)');
    if (!r.dailyMenu && r.weekday !== undefined) bad('weekday solo vale en un menú del día');
  }
  const days = recipes.filter((r) => r.dailyMenu).map((r) => r.weekday).sort();
  if (days.join() !== '0,1,2,3,4,5,6') {
    console.error(`❌ recipes.json: tiene que haber exactamente un menú del día por día de la semana (hay: ${days.join(', ') || 'ninguno'})`);
    process.exit(1);
  }
  const c = balance.cooking;
  const per5 = (a) => Array.isArray(a) && a.length === 5 && a.every((n) => n > 0);
  if (!c || !per5(c.decoysByDifficulty) || !per5(c.revealMsByDifficulty) || !per5(c.durationSecondsByDifficulty) || !per5(c.hotPot?.windowMsByDifficulty)
    || !(c.thresholds?.good > 0 && c.thresholds.good < c.thresholds.perfect && c.thresholds.perfect <= 1)) {
    console.error('❌ balance.json: falta cooking o le faltan las tablas por dificultad (5 valores) o los umbrales');
    process.exit(1);
  }
  console.log(`✓ recipes.json: ${recipes.length} recetas validadas (${days.length} menús del día)`);
}

console.log('=== TODOS LOS DATOS DE JUEGO Y ASSETS SON VÁLIDOS ===');
