#!/usr/bin/env tsx
/**
 * Genera tomas candidatas con la API de efectos de sonido de ElevenLabs (spec 40).
 *
 *   pnpm sfx:generate --dry-run              # qué se generaría y cuántos segundos (no llama a la API)
 *   pnpm sfx:generate --only ui,pet.eat      # solo esos prefijos
 *   pnpm sfx:generate --only ui --force      # regenera aunque el prompt no haya cambiado
 *   pnpm sfx:generate --candidates 2         # menos tomas por sonido (ahorra créditos)
 *
 * Necesita ELEVENLABS_API_KEY en el entorno o en `.env` de la raíz (está en .gitignore).
 * Solo se usa aquí, en desarrollo: la key no va nunca en las apps ni en el backend.
 *
 * Solo pide lo nuevo o lo que cambió (hash del prompt, duración, loop e influencia en
 * scripts/sfx/sounds.lock.json). Las tomas quedan en scripts/sfx/.candidates/<id>/<n>.mp3;
 * después: `pnpm sfx:review` para elegir y `pnpm sfx:import` para pasarlas al juego.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SoundDef } from '../../shared/audio/src/manifest';
import {
  argValue,
  CANDIDATES_DIR,
  generationHash,
  hasFlag,
  loadEnv,
  loadManifest,
  matchesOnly,
  readLock,
  writeLock,
} from './common';

const API_URL = 'https://api.elevenlabs.io/v1/sound-generation';
const OUTPUT_FORMAT = 'mp3_44100_128';

loadEnv();
const apiKey = process.env.ELEVENLABS_API_KEY;
const model = process.env.ELEVENLABS_SFX_MODEL || 'eleven_text_to_sound_v2';
const dryRun = hasFlag('--dry-run');
const force = hasFlag('--force');
const only = (argValue('--only') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const candidatesOverride = argValue('--candidates') ? Number(argValue('--candidates')) : undefined;
const concurrency = Math.max(1, Number(argValue('--concurrency') ?? 3));

const sounds = loadManifest();
const lock = readLock();

const todo = [...sounds.values()].filter((d) => {
  if (d.source !== 'elevenlabs' || !matchesOnly(d.id, only)) return false;
  if (force) return true;
  const prev = lock[d.id];
  return !prev || prev.hash !== generationHash(d);
});

const candidatesFor = (d: SoundDef) => Math.max(d.variants, candidatesOverride ?? d.candidates);
const seconds = todo.reduce((s, d) => s + d.duration * candidatesFor(d), 0);
const calls = todo.reduce((s, d) => s + candidatesFor(d), 0);

console.log(`${todo.length} sonidos → ${calls} llamadas, ≈ ${Math.round(seconds)} s de audio (modelo ${model})`);
if (dryRun || todo.length === 0) {
  for (const d of todo) console.log(`  ${d.id.padEnd(40)} ${candidatesFor(d)} × ${d.duration}s${d.loop ? ' loop' : ''}`);
  process.exit(0);
}
if (!apiKey) {
  console.error('Falta ELEVENLABS_API_KEY (en el entorno o en .env de la raíz).');
  process.exit(1);
}

async function generateOne(def: SoundDef, attempt = 0): Promise<Buffer> {
  const body: Record<string, unknown> = {
    text: def.prompt,
    duration_seconds: def.duration,
    prompt_influence: def.promptInfluence,
    model_id: model,
  };
  if (def.loop) body.loop = true;
  const res = await fetch(`${API_URL}?output_format=${OUTPUT_FORMAT}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey!, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify(body),
  });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 4) throw new Error(`${def.id}: HTTP ${res.status} tras ${attempt + 1} intentos`);
    const wait = 2000 * 2 ** attempt;
    console.warn(`  ${def.id}: HTTP ${res.status}, reintento en ${wait / 1000}s`);
    await new Promise((r) => setTimeout(r, wait));
    return generateOne(def, attempt + 1);
  }
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    throw new Error(`${def.id}: HTTP ${res.status} ${text}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function processSound(def: SoundDef): Promise<void> {
  const dir = join(CANDIDATES_DIR, def.id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const n = candidatesFor(def);
  for (let i = 0; i < n; i++) {
    const audio = await generateOne(def);
    writeFileSync(join(dir, `${i + 1}.mp3`), audio);
  }
  lock[def.id] = { hash: generationHash(def), candidates: n, generatedAt: new Date().toISOString() };
  writeLock(lock);
  console.log(`✓ ${def.id} (${n} tomas)`);
}

async function main() {
  const queue = [...todo];
  let failed = 0;
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    for (let def = queue.shift(); def; def = queue.shift()) {
      try {
        await processSound(def);
      } catch (err) {
        failed++;
        console.error(`✗ ${(err as Error).message}`);
        if (/HTTP 401|HTTP 403/.test((err as Error).message)) queue.length = 0;
      }
    }
  });
  await Promise.all(workers);
  console.log(failed ? `Terminado con ${failed} fallo(s).` : 'Listo. Siguiente paso: pnpm sfx:review');
  if (failed) process.exit(1);
}

void main();
