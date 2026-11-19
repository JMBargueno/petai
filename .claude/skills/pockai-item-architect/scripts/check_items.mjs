#!/usr/bin/env node
// Comprueba reglas de diseño de foods.json (los consumibles) que no cubre scripts/validate-game-data.js:
// tipos que el backend sabe usar, claves de efectos, bandas de precio, referencias desde balance.json
// y species.json, briefs y arte. Da también el inventario y los huecos del catálogo.
// Uso: node .claude/skills/pockai-item-architect/scripts/check_items.mjs [itemId]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, 'shared/game-data', f), 'utf8'));
const foods = read('foods.json');
const species = read('species.json');
const balance = read('balance.json');
const accessories = read('accessories.json').accessories ?? [];

// Tipos con mecánica en el backend (references/item-schema.md). Cualquier otro es un objeto que no hace nada.
const KINDS = ['food', 'medicine', 'evolution', 'level_up'];
const ELEMENTS = ['fire', 'water', 'plant', 'electric', 'shadow', 'light'];
const STATS = ['hunger', 'happiness', 'energy', 'health'];
const EFFECT_KEYS = [...STATS, 'curesSick', 'levels'];
const TIERS = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const ID = /^[a-z][a-z0-9_]*$/;
// Bandas orientativas (references/balance.md).
const FOOD_PRICE = [10, 60];
const MEDICINE_PRICE = [60, 150];
const MAX_BENEFIT_PER_COIN = 3.5; // la Manzana Crujiente (32 puntos por 10 monedas) marca el techo
const MAX_STAT = 40; // ningún efecto suelto pasa de aquí
const TRADEOFF_FROM = 60; // a partir de esta suma de beneficios, el objeto lleva una contrapartida

const only = process.argv[2];
const errors = [];
const warnings = [];
const seen = new Set();
const accIds = new Set(accessories.map((a) => a.id));
const foodIds = new Set(foods.map((f) => f.id));

if (only && !foodIds.has(only)) errors.push(`No existe el objeto '${only}' en foods.json`);

// --- Dónde se usa cada objeto ---
/** Flujos cuyas especies lo tienen como comida favorita. */
const favoriteOf = (id) => [...new Set(species.filter((s) => s.favoriteFood === id).map((s) => s.element))];
const chests = balance.chests?.types ?? balance.chests ?? {};
const chestTables = Object.entries(chests).filter(([, c]) => Array.isArray(c?.dropTable));
/** Mejor tier (el más común) con el que sale de algún cofre, o null. */
function chestTier(id) {
  const tiers = chestTables.flatMap(([, c]) => c.dropTable.filter((d) => d.itemId === id).map((d) => TIERS.indexOf(d.tier)));
  return tiers.length ? TIERS[Math.min(...tiers)] : null;
}
const minigameDrops = Object.entries(balance.minigames?.games ?? {}).filter(([, g]) => g.itemDrop).map(([id, g]) => [id, g.itemDrop.itemId]);
const itemFind = balance.personality?.autonomy?.itemFind?.items ?? [];
const evoId = balance.evolution?.finalStageItemId;

// --- Referencias rotas (las de species y balance también las mira validate-game-data.js) ---
for (const [chest, c] of chestTables) {
  for (const d of c.dropTable) {
    if (!foodIds.has(d.itemId)) errors.push(`Cofre ${chest}: '${d.itemId}' no existe en foods.json`);
    if (!TIERS.includes(d.tier)) errors.push(`Cofre ${chest}: tier desconocido '${d.tier}' en ${d.itemId}`);
  }
}
for (const [game, id] of minigameDrops) if (!foodIds.has(id)) errors.push(`Minijuego ${game}: itemDrop '${id}' no existe en foods.json`);
for (const id of itemFind) if (!foodIds.has(id)) errors.push(`itemFind: '${id}' no existe en foods.json`);
for (const s of species) if (!foodIds.has(s.favoriteFood)) errors.push(`Especie ${s.id}: favoriteFood '${s.favoriteFood}' no existe`);

const evolutions = foods.filter((f) => f.kind === 'evolution');
if (evolutions.length > 1) {
  errors.push(`Hay ${evolutions.length} objetos de kind "evolution" (${evolutions.map((f) => f.id).join(', ')}): el backend solo usa balance.evolution.finalStageItemId`);
}

for (const f of foods) {
  const tag = `[${f.id}]`;
  const mine = !only || f.id === only;
  const err = (m) => mine && errors.push(`${tag} ${m}`);
  const warn = (m) => mine && warnings.push(`${tag} ${m}`);

  if (!ID.test(f.id ?? '') || f.id.length > 64) err('id inválido (snake_case, hasta 64 caracteres)');
  if (seen.has(f.id)) err('id duplicado');
  seen.add(f.id);
  if (accIds.has(f.id)) err('el id ya existe en accessories.json');
  if ((f.id ?? '').startsWith('acc_') || (f.id ?? '').startsWith('ach_item_')) err('los prefijos acc_ y ach_item_ son de las prendas');
  if (!KINDS.includes(f.kind)) err(`kind '${f.kind}' sin mecánica en el backend (válidos: ${KINDS.join(', ')})`);

  const words = String(f.name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) err('falta name');
  else if (words.filter((w) => w.length > 2).length > 3) warn(`nombre largo («${f.name}»): mejor de 1 a 3 palabras`);
  const desc = String(f.description ?? '').trim();
  if (!desc) err('falta description');
  else if ((desc.match(/[.!?](\s|$)/g) ?? []).length > 2) warn('la descripción debería tener una frase, o dos si la segunda dice de quién es favorita');

  if (!Number.isInteger(f.priceCoins) || f.priceCoins < 0) err('priceCoins debe ser un entero mayor o igual que 0');
  if (!Number.isInteger(f.priceGems) || f.priceGems < 0) err('priceGems debe ser un entero mayor o igual que 0');
  // buyItem rechaza lo que no tiene precio, pero la tienda lo sigue listando con un botón que falla.
  // Spec 41: availability drop (cofres y actividades) u hidden (solo admin) no se vende y va a precio 0
  const avail = f.availability ?? 'shop';
  if (!['shop', 'drop', 'hidden'].includes(avail)) err(`availability '${avail}' no válida (shop, drop, hidden)`);
  if (avail !== 'shop' && (f.priceCoins > 0 || f.priceGems > 0)) err(`un objeto ${avail} no se vende: precio 0`);
  if (avail === 'shop' && f.priceCoins === 0 && f.priceGems === 0) warn('sin precio: no está a la venta, pero la tienda lo lista igualmente. Ponle precio salvo que solo deba salir de cofres o regalos');

  const e = f.effects ?? {};
  for (const k of Object.keys(e)) if (!EFFECT_KEYS.includes(k)) err(`effects.${k}: clave que el backend no lee (válidas: ${EFFECT_KEYS.join(', ')})`);
  for (const k of STATS) {
    if (e[k] === undefined) continue;
    if (!Number.isInteger(e[k])) err(`effects.${k} debe ser un entero`);
    else if (Math.abs(e[k]) > MAX_STAT) warn(`effects.${k} = ${e[k]}: ningún efecto suelto debería pasar de ±${MAX_STAT}`);
  }
  if (e.curesSick !== undefined && typeof e.curesSick !== 'boolean') err('effects.curesSick debe ser booleano');
  const benefit = STATS.reduce((n, k) => n + Math.max(0, e[k] ?? 0), 0);
  const cost = STATS.reduce((n, k) => n + Math.min(0, e[k] ?? 0), 0);

  if (f.kind === 'food') {
    if (e.curesSick) err('una comida no cura: curesSick es de kind "medicine"');
    if (!(e.hunger > 0)) warn('una comida debería saciar (effects.hunger > 0)');
    if (f.priceGems > 0) warn('una comida no debería costar gemas: tiene que poder comprarse jugando');
    if (f.priceCoins > 0 && (f.priceCoins < FOOD_PRICE[0] || f.priceCoins > FOOD_PRICE[1])) {
      warn(`precio ${f.priceCoins} fuera de la banda de comida (${FOOD_PRICE[0]}–${FOOD_PRICE[1]} monedas)`);
    }
    if (f.priceCoins > 0 && benefit / f.priceCoins > MAX_BENEFIT_PER_COIN) {
      warn(`da ${benefit} puntos por ${f.priceCoins} monedas (${(benefit / f.priceCoins).toFixed(1)} por moneda; techo ${MAX_BENEFIT_PER_COIN})`);
    }
    if (benefit > TRADEOFF_FROM && cost === 0) warn(`suma ${benefit} puntos de beneficio sin contrapartida: añade un efecto negativo`);
  } else if (f.kind === 'medicine') {
    if (!e.curesSick && !(e.health >= 30)) warn('una medicina debería curar (curesSick) o dar al menos 30 de salud');
    if (f.priceCoins > 0 && (f.priceCoins < MEDICINE_PRICE[0] || f.priceCoins > MEDICINE_PRICE[1])) {
      warn(`precio ${f.priceCoins} fuera de la banda de medicina (${MEDICINE_PRICE[0]}–${MEDICINE_PRICE[1]} monedas)`);
    }
    // PetsService.heal suma los cuatro efectos (health vale 40 si falta o es 0) y siempre quita la enfermedad.
    if ((e.hunger ?? 0) > 0) warn('una medicina no debería saciar: para eso está la comida');
    if (!(e.health > 0)) warn('sin effects.health el backend da 40 de salud por defecto: escríbelo');
  } else if (f.kind === 'level_up') {
    if (!(Number.isInteger(e.levels) && e.levels >= 1)) err('un objeto level_up necesita effects.levels entero ≥ 1');
  } else if (f.kind === 'evolution') {
    if (f.id !== evoId) err(`no es balance.evolution.finalStageItemId ('${evoId}'): el backend nunca lo usará`);
    if (Object.keys(e).length) warn('un objeto de evolución no lleva effects: los ignora el backend');
    if (f.priceCoins > 0) warn('la evolución se paga con gemas o se gana en cofres, no con monedas');
  }

  // Brief y arte: por objeto solo al pedir uno; del catálogo entero se da el recuento en «Huecos».
  if (only) {
    if (!fs.existsSync(path.join(root, 'docs/objetos', `${f.id}.md`))) warn(`sin brief en docs/objetos/${f.id}.md`);
    if (!fs.existsSync(path.join(root, 'shared/assets/items', `${f.id}.png`))) warn(`sin arte en shared/assets/items/${f.id}.png`);
  }
}

// --- Inventario ---
const line = (f) => {
  const e = f.effects ?? {};
  const fx = STATS.filter((k) => e[k]).map((k) => `${k} ${e[k] > 0 ? '+' : ''}${e[k]}`).concat(e.curesSick ? ['cura'] : []).concat(e.levels ? [`+${e.levels} nivel`] : []).join(', ') || 'sin efectos';
  const price = [f.priceCoins ? `${f.priceCoins} mon.` : '', f.priceGems ? `${f.priceGems} gem.` : ''].filter(Boolean).join(' + ') || ({ drop: 'solo drop', hidden: 'oculto (solo admin)' }[f.availability] ?? 'no se vende');
  const fav = favoriteOf(f.id);
  const where = [chestTier(f.id) ? `cofres (${chestTier(f.id)})` : '', itemFind.includes(f.id) ? 'hallazgo' : '', ...minigameDrops.filter(([, id]) => id === f.id).map(([g]) => `minijuego ${g}`), ...Object.entries(balance.activityDrops?.sources ?? {}).filter(([, l]) => (l ?? []).some((d) => d.itemId === f.id)).map(([src]) => `actividad ${src}`)].filter(Boolean).join(', ');
  const art = fs.existsSync(path.join(root, 'shared/assets/items', `${f.id}.png`)) ? 'arte ✓' : 'arte —';
  return `  ${f.id} «${f.name}» · ${price} · ${fx}${fav.length ? ` · favorita de ${fav.join('/')}` : ''}${where ? ` · ${where}` : ''} · ${art}`;
};
console.log(`Objetos: ${foods.length}`);
for (const k of [...KINDS, ...new Set(foods.map((f) => f.kind).filter((x) => !KINDS.includes(x)))]) {
  const list = foods.filter((f) => f.kind === k);
  console.log(`${k} (${list.length})`);
  for (const f of list) if (!only || f.id === only) console.log(line(f));
}

if (!only) {
  // --- Huecos: lo que le falta al catálogo ---
  const gaps = [];
  const favByElement = Object.fromEntries(ELEMENTS.map((el) => [el, [...new Set(species.filter((s) => s.element === el).map((s) => s.favoriteFood))]]));
  for (const el of ELEMENTS) {
    if (favByElement[el].length === 0) gaps.push(`El Flujo ${el} no tiene comida favorita`);
    else if (favByElement[el].length === 1) gaps.push(`Flujo ${el}: todas sus especies comparten favorita (${favByElement[el][0]}); cabe una segunda para las rarezas altas`);
  }
  const noChest = foods.filter((f) => !chestTier(f.id) && f.kind === 'food').map((f) => f.id);
  if (noChest.length) gaps.push(`Comidas que no salen en ningún cofre: ${noChest.join(', ')}`);
  for (const t of TIERS) {
    const n = new Set(chestTables.flatMap(([, c]) => c.dropTable.filter((d) => d.tier === t).map((d) => d.itemId))).size;
    if (n <= 1) gaps.push(`Tier de cofre ${t}: ${n === 0 ? 'ningún objeto' : 'un solo objeto'}`);
  }
  if (foods.filter((f) => f.kind === 'medicine').length === 1) gaps.push('Una sola medicina: cabe un remedio menor (ojo: hoy toda medicina quita la enfermedad)');
  const noArt = foods.filter((f) => !fs.existsSync(path.join(root, 'shared/assets/items', `${f.id}.png`))).length;
  if (noArt) gaps.push(`${noArt} de ${foods.length} objetos sin arte`);
  const noBrief = foods.filter((f) => !fs.existsSync(path.join(root, 'docs/objetos', `${f.id}.md`))).length;
  if (noBrief) gaps.push(`${noBrief} de ${foods.length} objetos sin brief en docs/objetos/`);
  if (gaps.length) {
    console.log(`\nHuecos (${gaps.length}):`);
    for (const g of gaps) console.log(`  · ${g}`);
  }
}
if (warnings.length) {
  console.log(`\nAvisos (${warnings.length}):`);
  for (const w of warnings) console.log(`  ! ${w}`);
}
if (errors.length) {
  console.error(`\nErrores (${errors.length}):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`\n✓ ${only ? `Objeto ${only}` : 'Catálogo'} sin errores`);
