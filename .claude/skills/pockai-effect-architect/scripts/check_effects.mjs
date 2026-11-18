#!/usr/bin/env node
/**
 * Inventario y comprobaciones de los efectos del escritorio (desktop/src/lib/effects).
 *
 *   node .claude/skills/pockai-effect-architect/scripts/check_effects.mjs [id]
 *
 * Lee el código sin ejecutarlo (es TypeScript): saca de cada efecto su id, lore, rejilla, fases y
 * fps, y avisa de lo que incumple la skill: sin registrar, sin test, sin variante reducida, más de
 * 2,5 s, rejilla grande, escala no entera, Math.random en el dibujo o efecto sin usar en la app.
 * Sale con código 1 si hay errores (los avisos no cuentan).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
const dir = join(root, 'desktop/src/lib/effects');
const srcDir = join(root, 'desktop/src');
const ENGINE = new Set(['index.ts', 'types.ts', 'timeline.ts', 'palettes.ts', 'render.ts']);
const only = process.argv[2];

if (!existsSync(dir)) {
  console.error(`No existe ${relative(root, dir)}: el motor de efectos aún no está.`);
  process.exit(1);
}

const index = readFileSync(join(dir, 'index.ts'), 'utf8');

/** Archivos .ts/.svelte de la app (para ver si el efecto se usa). */
function walk(d, out = []) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|svelte)$/.test(f) && !f.endsWith('.spec.ts') && !p.startsWith(dir)) out.push(p);
  }
  return out;
}
const appFiles = walk(srcDir).map((p) => [p, readFileSync(p, 'utf8')]);

function phasesOf(src, key) {
  const m = src.match(new RegExp(`${key}:\\s*\\[([\\s\\S]*?)\\]`));
  if (!m) return null;
  return [...m[1].matchAll(/name:\s*'([^']+)'\s*,\s*ms:\s*('hold'|\d+)/g)].map(([, name, ms]) => ({
    name,
    ms: ms === "'hold'" ? 'hold' : Number(ms),
  }));
}
const num = (src, key) => {
  const m = src.match(new RegExp(`\\b${key}:\\s*(\\w+)`));
  if (!m) return NaN;
  const v = Number(m[1]);
  if (!Number.isNaN(v)) return v;
  const c = src.match(new RegExp(`const ${m[1]}\\s*=\\s*([\\d.]+)`));
  return c ? Number(c[1]) : NaN;
};

let errors = 0;
let warnings = 0;
const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && !ENGINE.has(f));
const rows = [];

for (const f of files) {
  const src = readFileSync(join(dir, f), 'utf8');
  const id = src.match(/\bid:\s*'([^']+)'/)?.[1];
  if (!id) continue;
  if (only && id !== only) continue;
  const exportName = src.match(/export const (\w+)\s*:\s*EffectDef/)?.[1] ?? '?';
  const lore = src.match(/\blore:\s*'([^']*)'/)?.[1] ?? '';
  const phases = phasesOf(src, 'phases') ?? [];
  const reduced = phasesOf(src, 'reducedPhases');
  const w = num(src, 'width');
  const h = num(src, 'height');
  const scale = num(src, 'scale');
  const fps = num(src, 'fps');
  const total = phases.reduce((a, p) => a + (p.ms === 'hold' ? 0 : p.ms), 0);
  const issues = [];
  const err = (m) => (issues.push(`ERROR  ${m}`), errors++);
  const warn = (m) => (issues.push(`aviso  ${m}`), warnings++);

  if (!new RegExp(`\\b${exportName}\\b`).test(index)) err(`no está registrado en effects/index.ts (EFFECTS)`);
  if (!existsSync(join(dir, f.replace(/\.ts$/, '.spec.ts')))) err(`falta el test ${f.replace(/\.ts$/, '.spec.ts')}`);
  if (!lore || !/§\s*\d+/.test(lore)) warn('el lore no cita una sección de docs/LORE.md (§N)');
  if (!reduced?.length) err('falta reducedPhases (prefers-reduced-motion)');
  else if (reduced.map((p) => p.name).join() !== phases.map((p) => p.name).join()) warn('reducedPhases no tiene las mismas fases que phases');
  if (!/reduced/.test(src.split('export const')[0])) warn('el dibujo no mira frame.reduced: con movimiento reducido debe quedarse quieto');
  if (total > 2500) err(`dura ${total} ms sin contar el hold (máx. 2500)`);
  if (!(w <= 64 && h <= 80)) err(`rejilla ${w}×${h} (máx. 64×80)`);
  if (!Number.isInteger(scale) || scale < 1) err(`escala ${scale}: debe ser entera`);
  if (fps !== 12) warn(`cadencia ${fps} fps (lo normal son 12)`);
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  if (/Math\.random/.test(code)) err('usa Math.random: el dibujo debe ser determinista (hash con la semilla)');
  const used = appFiles.filter(([p, s]) => !p.startsWith(dir) && new RegExp(`\\b${exportName}\\b`).test(s));
  if (!used.length) warn('ningún componente de la app lo usa todavía');

  rows.push({ id, f, lore, phases, total, w, h, scale, fps, used: used.map(([p]) => relative(root, p)), issues });
}

if (!rows.length) {
  console.log(only ? `No hay ningún efecto con id «${only}».` : 'No hay efectos registrados todavía.');
  process.exit(only ? 1 : 0);
}

console.log(`Efectos del escritorio (${rows.length})\n`);
for (const r of rows) {
  console.log(`■ ${r.id}  (${r.f})`);
  console.log(`  lore: ${r.lore || '—'}`);
  console.log(`  rejilla ${r.w}×${r.h} ×${r.scale} · ${r.fps} fps · ${r.total} ms + hold`);
  console.log(`  fases: ${r.phases.map((p) => `${p.name} ${p.ms === 'hold' ? '(hold)' : p.ms + 'ms'}`).join(' → ')}`);
  console.log(`  usado en: ${r.used.join(', ') || '—'}`);
  for (const i of r.issues) console.log(`  ${i}`);
  console.log('');
}
console.log(`${errors} errores, ${warnings} avisos.`);
process.exit(errors ? 1 : 0);
