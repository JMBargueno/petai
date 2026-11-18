#!/usr/bin/env node
// Comprueba reglas de diseño de accessories.json que no cubre scripts/validate-game-data.js:
// reparto por ranura, rareza frente a vía de desbloqueo, precios orientativos, rampas repetidas,
// nombres, briefs y premios de logro que aún no son prenda. Da también el inventario.
// Uso: node .claude/skills/pockai-accessory-architect/scripts/check_accessories.mjs [accessoryId]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, 'shared/game-data', f), 'utf8'));
const data = read('accessories.json');
const achievements = read('achievements.json').achievements;
const foods = read('foods.json');

const SLOTS = ['head', 'face', 'neck', 'back'];
const RARITIES = ['normal', 'rare', 'super_rare', 'legendary', 'mythic'];
const COLORS = ['ember', 'sunburst', 'mint', 'blue', 'violet', 'lavender', 'white', 'carbon'];
const FX = ['heart', 'zzz', 'sparkle', 'drop'];
const ID = /^[a-z][a-z0-9_]*$/;
// Precios orientativos por rareza (references/balance.md).
const PRICE = {
  coins: { normal: [150, 350], rare: [400, 800] },
  gems: { rare: [8, 15], super_rare: [20, 40], legendary: [60, 120] },
};
// Rareza máxima de una prenda según el tier del logro que la entrega.
const TIER_MAX = { common: 'normal', rare: 'rare', epic: 'super_rare', legendary: 'legendary' };

const only = process.argv[2];
const errors = [];
const warnings = [];
const list = data.accessories ?? [];
const achById = new Map(achievements.map((a) => [a.id, a]));
const foodIds = new Set(foods.map((f) => f.id));
const seen = new Set();

if (only && !list.some((a) => a.id === only)) errors.push(`No existe la prenda '${only}' en accessories.json`);

for (const a of list) {
  const tag = `[${a.id}]`;
  const mine = !only || a.id === only;
  const err = (m) => mine && errors.push(`${tag} ${m}`);
  const warn = (m) => mine && warnings.push(`${tag} ${m}`);

  if (!ID.test(a.id ?? '') || a.id.length > 64) err('id inválido (snake_case, hasta 64 caracteres)');
  if (seen.has(a.id)) err('id duplicado');
  seen.add(a.id);
  if (foodIds.has(a.id)) err('el id ya existe en foods.json');
  if (!SLOTS.includes(a.slot)) err(`ranura desconocida: ${a.slot}`);
  if (!RARITIES.includes(a.rarity)) err(`rareza desconocida: ${a.rarity}`);
  if (!COLORS.includes(a.color)) err(`color desconocido: ${a.color} (válidos: ${COLORS.join(', ')})`);

  const words = String(a.name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) err('falta name');
  else if (words.filter((w) => w.length > 2).length > 3) warn(`nombre largo («${a.name}»): mejor de 1 a 3 palabras`);
  if (!a.description || /\.\s+\S/.test(a.description.trim())) warn('la descripción debería ser una sola frase');

  const u = a.unlock ?? {};
  const rank = RARITIES.indexOf(a.rarity);
  if (u.type === 'coins' || u.type === 'gems') {
    if (!Number.isInteger(u.price) || u.price <= 0) err('unlock.price debe ser un entero mayor que 0');
    if (!a.id.startsWith('acc_')) err('una prenda de compra lleva el prefijo acc_');
    if (u.type === 'gems' && a.rarity === 'normal') warn('una prenda normal no debería costar gemas');
    if (a.rarity === 'mythic') warn('una prenda mítica no se vende: debería ser de logro');
    const range = PRICE[u.type]?.[a.rarity];
    if (!range && a.rarity !== 'mythic' && !(u.type === 'gems' && a.rarity === 'normal')) {
      warn(`rareza ${a.rarity} poco habitual para ${u.type === 'coins' ? 'monedas' : 'gemas'}`);
    } else if (range && Number.isInteger(u.price) && (u.price < range[0] || u.price > range[1])) {
      warn(`precio ${u.price} fuera del rango orientativo ${range[0]}–${range[1]} para ${a.rarity}`);
    }
  } else if (u.type === 'achievement') {
    const ach = achById.get(u.achievementId);
    if (!ach) err(`el logro '${u.achievementId}' no existe`);
    else {
      if (ach.reward?.itemId !== a.id) err(`el logro '${ach.id}' entrega '${ach.reward?.itemId}', no esta prenda`);
      const max = RARITIES.indexOf(TIER_MAX[ach.tier] ?? 'legendary');
      if (rank > max) warn(`rareza ${a.rarity} por encima del logro (${ach.tier})`);
      if (rank < max - 1) warn(`rareza ${a.rarity} muy por debajo del logro (${ach.tier})`);
    }
    if (u.price !== undefined) err('una prenda de logro no lleva precio');
  } else {
    err(`unlock.type desconocido: ${u.type}`);
  }

  if (a.animated !== undefined && typeof a.animated !== 'boolean') err('animated debe ser booleano');
  if (a.animated && rank < RARITIES.indexOf('legendary')) warn('animated solo en legendary y mythic');
  if (a.fx !== undefined && !FX.includes(a.fx)) err(`fx desconocida: ${a.fx}`);
  if (a.fx && a.rarity !== 'mythic') warn('fx solo en prendas mythic');
  if (a.rarity === 'legendary' && !a.animated) warn('una prenda legendary debería llevar animated: true');
  if (a.rarity === 'mythic' && (!a.animated || !a.fx)) warn('una prenda mythic debería llevar animated y fx');

  if (!fs.existsSync(path.join(root, 'docs/accesorios', `${a.id}.md`))) warn(`sin brief en docs/accesorios/${a.id}.md`);
}

// --- Reparto del catálogo ---
const count = (key, values) => Object.fromEntries(values.map((v) => [v, list.filter((a) => key(a) === v).length]));
const bySlot = count((a) => a.slot, SLOTS);
const byRarity = count((a) => a.rarity, RARITIES);
const byUnlock = count((a) => a.unlock?.type, ['coins', 'gems', 'achievement']);
const slotCounts = Object.values(bySlot);
if (Math.min(...slotCounts) === 0) errors.push(`Ranura sin prendas: ${SLOTS.filter((s) => bySlot[s] === 0).join(', ')}`);
else if (Math.max(...slotCounts) > 2 * Math.min(...slotCounts)) {
  const few = SLOTS.filter((s) => bySlot[s] === Math.min(...slotCounts));
  warnings.push(`Reparto desigual por ranura: la siguiente prenda debería ir a ${few.join(' o ')}`);
}
if (list.length >= 4 && byUnlock.coins < list.length / 2) {
  warnings.push(`Solo ${byUnlock.coins} de ${list.length} prendas se compran con monedas (objetivo: al menos la mitad)`);
}
if ((byRarity.legendary + byRarity.mythic) * 5 > list.length) {
  warnings.push(`Demasiadas prendas legendary o mythic: ${byRarity.legendary + byRarity.mythic} de ${list.length} (objetivo: una de cada cinco)`);
}
for (const s of SLOTS) {
  const inSlot = list.filter((a) => a.slot === s);
  const used = new Set(inSlot.map((a) => a.color));
  for (const c of used) {
    const n = inSlot.filter((a) => a.color === c).length;
    if (n > 1 && used.size < 4 && (!only || inSlot.some((a) => a.id === only && a.color === c))) {
      warnings.push(`Ranura ${s}: la rampa ${c} se repite ${n} veces con solo ${used.size} rampas distintas en uso`);
    }
  }
}

// --- Premios de logro que aún no son prenda ---
const accIds = new Set(list.map((a) => a.id));
const pending = achievements.filter((a) => a.reward?.itemId && !accIds.has(a.reward.itemId));

const fmt = (o) => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(' · ');
console.log(`Accesorios: ${list.length}`);
console.log(`  Por ranura:  ${fmt(bySlot)}`);
console.log(`  Por rareza:  ${fmt(byRarity)}`);
console.log(`  Por vía:     ${fmt(byUnlock)}`);
for (const s of SLOTS) {
  const inSlot = list.filter((a) => a.slot === s);
  console.log(`  ${s}: ${inSlot.map((a) => `${a.name} (${a.color}, ${a.rarity})`).join('; ') || 'ninguna'}`);
  console.log(`    rampas libres: ${COLORS.filter((c) => !inSlot.some((a) => a.color === c)).join(', ') || 'ninguna'}`);
}
if (!only) {
  console.log(`Premios de logro sin convertir en prenda: ${pending.length}`);
  for (const a of pending) console.log(`  ${a.reward.itemId}  ←  ${a.id} «${a.name}» (${a.tier})`);
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
console.log(`\n✓ ${only ? `Prenda ${only}` : 'Catálogo'} sin errores`);
