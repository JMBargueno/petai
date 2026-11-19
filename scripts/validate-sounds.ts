#!/usr/bin/env tsx
/**
 * validate-sounds.ts — spec 40 (efectos de sonido).
 *
 * Valida shared/game-data/sounds.json y lo cruza con lo que hay en shared/assets/audio:
 *   - el manifiesto cumple el esquema (normalizeManifest);
 *   - cada sonido `synth` tiene receta en shared/audio/src/synth.ts;
 *   - cada fichero de audio pertenece a un id del manifiesto, en su bus y sin pasarse de `variants`.
 * Que falten ficheros NO es error (se van generando por fases): se informa como aviso.
 *
 *   tsx scripts/validate-sounds.ts
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { normalizeManifest, sourcesFromFiles } from '../shared/audio/src/manifest';
import { SYNTHS } from '../shared/audio/src/synth';

const root = resolve(__dirname, '..');
const manifestPath = join(root, 'shared/game-data/sounds.json');
const audioDir = join(root, 'shared/assets/audio');

const { manifest, errors } = normalizeManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
const warnings: string[] = [];

for (const def of manifest.sounds.values()) {
  if (def.source === 'synth' && !SYNTHS[def.id]) errors.push(`sound ${def.id}: es synth pero no hay receta en shared/audio/src/synth.ts`);
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(audioDir).filter((p) => /\.(m4a|mp3|ogg)$/.test(p));
const byPath: Record<string, string> = {};
for (const f of files) byPath[relative(audioDir, f).replace(/\\/g, '/')] = f;
const sources = sourcesFromFiles(byPath);

for (const [id, urls] of sources) {
  const def = manifest.sounds.get(id);
  if (!def) {
    errors.push(`audio ${id}: hay ficheros pero el id no está en sounds.json`);
    continue;
  }
  if (def.source === 'synth') errors.push(`audio ${id}: es synth y no debería tener fichero`);
  if (urls.length > def.variants) errors.push(`audio ${id}: ${urls.length} tomas, el manifiesto admite ${def.variants}`);
  const wrongBus = urls.find((u) => !relative(audioDir, u).replace(/\\/g, '/').startsWith(`${def.bus}/`));
  if (wrongBus) errors.push(`audio ${id}: el fichero debe ir en ${def.bus}/`);
}
for (const f of files) {
  if (!/(ui|sfx|pet|ambient|music)\/[a-z0-9_.-]+_\d+\.(m4a|mp3|ogg)$/.test(relative(audioDir, f).replace(/\\/g, '/'))) {
    errors.push(`audio ${relative(root, f)}: nombre no válido (esperado <bus>/<id>_<n>.m4a)`);
  }
}

const generated = [...manifest.sounds.values()].filter((d) => d.source === 'elevenlabs');
const missing = generated.filter((d) => !sources.has(d.id));
if (missing.length) warnings.push(`${missing.length}/${generated.length} sonidos aún sin fichero (pnpm sfx:generate)`);

for (const e of errors) console.error(`✗ ${e}`);
for (const w of warnings) console.warn(`! ${w}`);
if (errors.length) {
  console.error(`sounds.json: ${errors.length} error(es)`);
  process.exit(1);
}
const seconds = generated.reduce((s, d) => s + d.duration * d.candidates, 0);
console.log(
  `✓ sounds.json: ${manifest.sounds.size} sonidos (${generated.length} ElevenLabs, ${manifest.sounds.size - generated.length} sintetizados), ` +
    `${files.length} ficheros; generar todos los candidatos ≈ ${Math.round(seconds)} s de audio`,
);
