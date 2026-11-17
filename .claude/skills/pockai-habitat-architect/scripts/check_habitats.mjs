#!/usr/bin/env node
// Comprueba reglas de diseño de habitats.json que no cubren los validadores del repo:
// claves de buff válidas, topes por mueble, sumas frente a buffCaps, huellas/montaje/interacción
// (campos de la migración isométrica) y arte isométrico presente.
// Uso: node .claude/skills/pockai-habitat-architect/scripts/check_habitats.mjs [furnitureId]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'shared/game-data/habitats.json'), 'utf8'));

const BUFFS = ['hygiene_decay_reduction', 'happiness_decay_reduction', 'energy_recovery_boost', 'combat_mood_bonus'];
const MOUNTS = ['floor', 'wall'];
const INTERACTIONS = ['sleep', 'eat', 'play', 'bathe', 'sit'];
const ID = /^[a-z][a-z0-9_]*$/;
const only = process.argv[2];
const errors = [];
const warnings = [];

const rooms = new Map(data.rooms.map((r) => [r.id, r]));
const caps = data.buffCaps ?? {};
const capOf = (k) => caps[`${k}_max`] ?? caps[k];

for (const f of data.furniture) {
  if (only && f.id !== only) continue;
  const tag = `[${f.id}]`;
  if (!ID.test(f.id)) errors.push(`${tag} id inválido (snake_case)`);
  const room = rooms.get(f.room);
  if (!room) errors.push(`${tag} sala inexistente: ${f.room}`);
  const keys = Object.keys(f.buffs ?? {});
  for (const k of keys) if (!BUFFS.includes(k)) errors.push(`${tag} buff desconocido: ${k} (válidos: ${BUFFS.join(', ')})`);
  if (keys.length > 2) warnings.push(`${tag} más de 2 buffs`);
  const sum = keys.reduce((a, k) => a + f.buffs[k], 0);
  if (sum > 0.35) warnings.push(`${tag} suma de buffs ${sum.toFixed(2)} > 0,35`);
  for (const k of keys) {
    const cap = capOf(k);
    if (typeof cap === 'number' && f.buffs[k] > cap * 0.6) warnings.push(`${tag} ${k}=${f.buffs[k]} se acerca al tope (${cap})`);
  }
  if (f.currency === 'gems' && f.price > 5) warnings.push(`${tag} precio en gemas alto (${f.price})`);
  if (f.currency === 'coins' && keys.length === 0 && f.price > 250) warnings.push(`${tag} decorativo caro (${f.price} coins)`);
  if (!/\d/.test(f.description) && keys.length) warnings.push(`${tag} la description no cita el valor del buff`);

  // Campos de la migración isométrica (GUIA_ARTISTICA §7.4)
  if (f.footprint === undefined) warnings.push(`${tag} sin footprint (se asumirá 1×1)`);
  else if (!Array.isArray(f.footprint) || f.footprint.length !== 2 || !f.footprint.every((n) => Number.isInteger(n) && n >= 1 && n <= 4))
    errors.push(`${tag} footprint debe ser [w, d] con enteros 1..4`);
  else if (room && (f.footprint[0] > room.gridWidth || f.footprint[1] > room.gridHeight)) errors.push(`${tag} footprint no cabe en ${room.id}`);
  if (f.mount !== undefined && !MOUNTS.includes(f.mount)) errors.push(`${tag} mount inválido: ${f.mount}`);
  if (f.interaction !== undefined && !INTERACTIONS.includes(f.interaction)) errors.push(`${tag} interaction inválida: ${f.interaction}`);

  const art = ['a', 'b'].filter((o) => !fs.existsSync(path.join(root, 'shared/assets/furniture', `${f.id}_${o}.svg`)));
  if (art.length) warnings.push(`${tag} sin arte isométrico (${art.map((o) => `${f.id}_${o}.svg`).join(', ')})`);
}

// Sumas del catálogo por buff (getActiveBuffs suma todas las salas)
const totals = Object.fromEntries(BUFFS.map((k) => [k, data.furniture.reduce((a, f) => a + (f.buffs?.[k] ?? 0), 0)]));
for (const [k, v] of Object.entries(totals)) {
  const cap = capOf(k);
  // Regla (references/balance.md): un mueble de cada tipo suma exactamente el tope.
  if (typeof cap === 'number' && v > cap + 1e-9) errors.push(`Catálogo: ${k} suma ${v.toFixed(2)} > tope ${cap}: rebalancea (un mueble de cada tipo debe sumar el tope)`);
  else if (typeof cap === 'number' && v > 0 && v < cap - 1e-9) warnings.push(`Catálogo: ${k} suma ${v.toFixed(2)} < tope ${cap}: el tope no se alcanza ni con el catálogo completo`);
}

for (const r of data.rooms) {
  const n = data.furniture.filter((f) => f.room === r.id).length;
  console.log(`Sala ${r.id} (${r.unlockStage}, ${r.gridWidth}×${r.gridHeight}): ${n} muebles${r.theme ? '' : ' · sin theme'}`);
}
console.log('Buffs del catálogo: ' + BUFFS.map((k) => `${k}=${totals[k].toFixed(2)}/${capOf(k) ?? '∞'}`).join(' '));
for (const w of warnings) console.log(`⚠ ${w}`);
for (const e of errors) console.error(`✗ ${e}`);
if (errors.length) process.exit(1);
console.log(`✓ check_habitats: ${only ?? 'todo'} OK`);
