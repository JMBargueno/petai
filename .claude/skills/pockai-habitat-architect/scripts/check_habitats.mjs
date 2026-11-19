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
const INTERACTIONS = ['sleep', 'eat', 'play', 'bathe', 'sit', 'listen'];
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
  // `*` = cualquier sala (spec 42): la huella debe caber en todas.
  const anyRoom = f.room === "*";
  const room = anyRoom ? [...rooms.values()].reduce((a, r) => (r.gridWidth * r.gridHeight < a.gridWidth * a.gridHeight ? r : a)) : rooms.get(f.room);
  if (!room) errors.push(`${tag} sala inexistente: ${f.room}`);
  if (f.unique !== undefined && typeof f.unique !== "boolean") errors.push(`${tag} unique debe ser booleano`);
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
  if (f.currency === 'coins' && keys.length === 0 && !f.interaction && f.price > 250) warnings.push(`${tag} decorativo caro (${f.price} coins)`);
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

// Forma de las salas (`blocked`): mismas reglas que roomShapeErrors en habitat-layout.ts
for (const r of data.rooms) {
  const holes = new Set();
  for (const b of r.blocked ?? []) {
    const [bx, by, bw, bh] = b;
    if (!Array.isArray(b) || b.length !== 4 || !b.every(Number.isInteger) || bw < 1 || bh < 1) errors.push(`[${r.id}] hueco mal formado: ${JSON.stringify(b)}`);
    else if (bx < 1 || by < 1) errors.push(`[${r.id}] el hueco ${b} toca una pared del fondo (x = 0 o y = 0)`);
    else if (bx + bw > r.gridWidth || by + bh > r.gridHeight) errors.push(`[${r.id}] el hueco ${b} se sale de la sala`);
    else for (let x = bx; x < bx + bw; x++) for (let y = by; y < by + bh; y++) holes.add(`${x},${y}`);
  }
  if (r.id === 'jardin') for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) if (holes.has(`${x},${y}`)) errors.push(`[jardin] la celda ${x},${y} es el refugio bajo el árbol: no puede ser un hueco`);
  const free = [];
  for (let x = 0; x < r.gridWidth; x++) for (let y = 0; y < r.gridHeight; y++) if (!holes.has(`${x},${y}`)) free.push(`${x},${y}`);
  const seen = new Set(free.slice(0, 1));
  const queue = free.slice(0, 1);
  while (queue.length) {
    const [x, y] = queue.pop().split(',').map(Number);
    for (const k of [`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`]) {
      if (free.includes(k) && !seen.has(k)) {
        seen.add(k);
        queue.push(k);
      }
    }
  }
  if (seen.size !== free.length) errors.push(`[${r.id}] el suelo queda partido en zonas sin conexión`);
}

for (const r of data.rooms) {
  const n = data.furniture.filter((f) => f.room === r.id || f.room === "*").length;
  console.log(`Sala ${r.id} (${r.unlockStage}, ${r.gridWidth}×${r.gridHeight}, ${(r.blocked ?? []).length} huecos): ${n} muebles${r.theme ? '' : ' · sin theme'}`);
}
console.log('Buffs del catálogo: ' + BUFFS.map((k) => `${k}=${totals[k].toFixed(2)}/${capOf(k) ?? '∞'}`).join(' '));
// Reparto por buff: es la fuente de verdad del reparto (no hay tabla fija que se desfase).
for (const k of BUFFS) {
  const parts = data.furniture.filter((f) => f.buffs?.[k]).map((f) => `${f.id} ${f.buffs[k]}`);
  if (parts.length) console.log(`  ${k}: ${parts.join(' · ')}`);
}
for (const w of warnings) console.log(`⚠ ${w}`);
for (const e of errors) console.error(`✗ ${e}`);
if (errors.length) process.exit(1);
console.log(`✓ check_habitats: ${only ?? 'todo'} OK`);
