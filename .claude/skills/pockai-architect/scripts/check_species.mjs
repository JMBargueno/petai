#!/usr/bin/env node
// Comprueba las reglas de diseño de species.json que no cubren los validadores del repo:
// total de baseStats por rareza, rango por stat, unicidad, formato y avisos de catálogo.
// Uso: node .claude/skills/pockai-architect/scripts/check_species.mjs [id]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const species = read('shared/game-data/species.json');
const foods = read('shared/game-data/foods.json');
const balance = read('shared/game-data/balance.json');

// Debe coincidir con references/balance.md
const RULES = {
  normal: { total: 250, min: 40, max: 60 },
  rare: { total: 265, min: 42, max: 65 },
  super_rare: { total: 280, min: 44, max: 70 },
  legendary: { total: 300, min: 46, max: 75 },
  mythic: { total: 320, min: 48, max: 80 },
};
const STATS = ['hp', 'atk', 'def', 'vel', 'esp'];
const ELEMENTS = ['fire', 'water', 'plant', 'electric', 'shadow', 'light'];
const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[a-z][a-z0-9_]*$/;

const only = process.argv[2];
const errors = [];
const warnings = [];
const foodIds = new Set(foods.map((f) => f.id));

const seen = { id: new Map(), name: new Map() };
for (const s of species) {
  for (const k of ['id', 'name']) {
    const v = String(s[k] ?? '').toLowerCase();
    if (seen[k].has(v)) errors.push(`${k} duplicado: "${s[k]}" (${seen[k].get(v)} y ${s.id})`);
    seen[k].set(v, s.id);
  }
}

for (const s of species) {
  if (only && s.id !== only) continue;
  const tag = `[${s.id}]`;
  if (!ID.test(s.id ?? '')) errors.push(`${tag} id inválido (usa ^[a-z][a-z0-9_]*$)`);
  if (s.spriteKey !== s.id) warnings.push(`${tag} spriteKey (${s.spriteKey}) distinto de id`);
  if (!ELEMENTS.includes(s.element)) errors.push(`${tag} element inválido: ${s.element}`);
  if (!balance.rarity?.[s.rarity]) errors.push(`${tag} rarity no está en balance.json: ${s.rarity}`);
  if (!foodIds.has(s.favoriteFood)) errors.push(`${tag} favoriteFood no existe en foods.json: ${s.favoriteFood}`);
  if (!s.description || s.description.length < 30) warnings.push(`${tag} description muy corta`);
  if (s.description && s.description.length > 260) warnings.push(`${tag} description larga (${s.description.length} car.); va al prompt del chat`);
  for (const k of ['primary', 'secondary', 'accent']) {
    if (!HEX.test(s.defaultPalette?.[k] ?? '')) errors.push(`${tag} defaultPalette.${k} no es #RRGGBB`);
  }

  const rule = RULES[s.rarity];
  const bs = s.baseStats ?? {};
  for (const k of STATS) {
    if (!Number.isInteger(bs[k])) errors.push(`${tag} baseStats.${k} debe ser entero`);
  }
  if (rule) {
    const total = STATS.reduce((a, k) => a + (bs[k] ?? 0), 0);
    if (total !== rule.total) errors.push(`${tag} total baseStats ${total} ≠ ${rule.total} (${s.rarity})`);
    for (const k of STATS) {
      if (bs[k] < rule.min || bs[k] > rule.max) errors.push(`${tag} baseStats.${k}=${bs[k]} fuera de [${rule.min}, ${rule.max}] (${s.rarity})`);
    }
  }

  // Sesgo de personalidad (5 dimensiones, 0-100). Ver references/personality.md
  const DIMS = ['curiosity', 'sociability', 'bravery', 'affection', 'temper'];
  const pb = s.personalityBias;
  if (!pb) {
    warnings.push(`${tag} sin personalityBias: nacerá con todas las dimensiones a ${balance.personality?.birth?.defaultBias ?? 50}`);
  } else {
    for (const k of Object.keys(pb)) if (!DIMS.includes(k)) errors.push(`${tag} personalityBias.${k} no es una dimensión válida`);
    for (const k of DIMS) {
      if (!Number.isInteger(pb[k]) || pb[k] < 15 || pb[k] > 85) errors.push(`${tag} personalityBias.${k} debe ser entero en [15, 85] (deja margen a la experiencia)`);
    }
    const vals = DIMS.map((k) => pb[k] ?? 50);
    const spread = Math.max(...vals) - Math.min(...vals);
    if (spread < 20) warnings.push(`${tag} personalityBias muy plano (rango ${spread}); da a la especie al menos un rasgo marcado`);
    for (const o of species) {
      if (o.id === s.id || !o.personalityBias) continue;
      const dist = DIMS.reduce((a, k) => a + Math.abs((o.personalityBias[k] ?? 50) - (pb[k] ?? 50)), 0);
      if (dist < 25) warnings.push(`${tag} personalityBias casi igual al de ${o.id} (distancia ${dist})`);
    }
  }

  // Diferenciación con especies del mismo elemento: mismo stat dominante
  const top = (b) => STATS.reduce((m, k) => (b[k] > b[m] ? k : m), STATS[0]);
  for (const o of species) {
    if (o.id === s.id || o.element !== s.element) continue;
    if (top(o.baseStats) === top(bs)) warnings.push(`${tag} mismo stat dominante (${top(bs)}) que ${o.id}, también ${s.element}`);
  }
}

// Arte: hojas por etapa (GUIA_ARTISTICA §7.4, ART_PIPELINE §8). Mientras dure la migración
// solo avisa; el alias species/<id>/{base,mask,anim} sí es obligatorio (lo exige validate-assets).
const STAGES = ['baby', 'juvenile', 'adult', 'final'];
const SHEET = ['base.png', 'mask.png', 'anim.json'];
const speciesTs = fs.readFileSync(path.join(root, 'scripts/sprites/species.ts'), 'utf8');
for (const s of species) {
  if (only && s.id !== only) continue;
  const tag = `[${s.id}]`;
  const dir = path.join(root, 'shared/assets/species', s.spriteKey ?? s.id);
  const missingAlias = SHEET.filter((f) => !fs.existsSync(path.join(dir, f)));
  if (missingAlias.length) errors.push(`${tag} faltan ${missingAlias.join(', ')} en ${path.relative(root, dir)}`);
  const missingStages = STAGES.filter((st) => SHEET.some((f) => !fs.existsSync(path.join(dir, st, f))));
  if (missingStages.length) warnings.push(`${tag} sin hojas por etapa (${missingStages.join(', ')}): los clientes usarán la hoja adult/alias`);
  const hasArt = new RegExp(`id:\\s*['"]${s.id}['"]`).test(speciesTs);
  if (!hasArt) warnings.push(`${tag} sin SpeciesArt en scripts/sprites/species.ts: sigue con placeholder`);
}

// Avisos de catálogo (fallback de eclosión)
const byRarity = Object.fromEntries(Object.keys(balance.rarity ?? {}).map((r) => [r, species.filter((s) => s.rarity === r).length]));
const empty = Object.entries(byRarity).filter(([, n]) => n === 0).map(([r]) => r);
if (empty.length) warnings.push(`Rarezas sin especies: ${empty.join(', ')} → la eclosión usa TODO el pool en esas tiradas`);
for (const [r, n] of Object.entries(byRarity)) {
  if (n === 1 && r !== 'normal') warnings.push(`Solo 1 especie ${r}: saldrá en todas las eclosiones ${r} (${(balance.rarity[r].probability * 100).toFixed(0)} %)`);
}

const summary = Object.entries(byRarity).map(([r, n]) => `${r}:${n}`).join(' ');
const byEl = ELEMENTS.map((e) => `${e}:${species.filter((s) => s.element === e).length}`).join(' ');
console.log(`Especies: ${species.length} | ${summary}\nElementos: ${byEl}`);
for (const w of warnings) console.log(`⚠ ${w}`);
for (const e of errors) console.error(`✗ ${e}`);
if (errors.length) process.exit(1);
console.log(`✓ check_species: ${only ? only : 'todas'} OK`);
