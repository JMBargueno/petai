#!/usr/bin/env tsx
/**
 * Genera tomas candidatas con la API de efectos de sonido de ElevenLabs (spec 40).
 *
 *   pnpm sfx:generate --dry-run              # qué se generaría y cuántos segundos (no llama a la API)
 *   pnpm sfx:generate --only ui,pet.eat      # solo esos prefijos
 *   pnpm sfx:generate --only ui --force      # regenera aunque el prompt no haya cambiado
 *   pnpm sfx:generate --candidates 2         # menos tomas por sonido (ahorra créditos)
 *   pnpm sfx:generate --no-loops             # sin los bucles de ambiente (los más caros)
 *
 * Necesita ELEVENLABS_API_KEY en el entorno o en `.env.local` / `.env` de la raíz (ignorados por
 * git; `npx @elevenlabs/cli onboard init` la deja en `.env.local`). Solo se usa aquí, en desarrollo:
 * la key no va nunca en las apps ni en el backend. Usa el SDK oficial @elevenlabs/elevenlabs-js.
 *
 * Solo pide lo nuevo o lo que cambió (hash del prompt, duración, loop e influencia en
 * scripts/sfx/sounds.lock.json). Las tomas quedan en scripts/sfx/.candidates/<id>/<n>.mp3;
 * después: `pnpm sfx:review` para elegir y `pnpm sfx:import` para pasarlas al juego.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ElevenLabsClient, ElevenLabsError } from '@elevenlabs/elevenlabs-js';
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

const OUTPUT_FORMAT = 'mp3_44100_128';

loadEnv();
const apiKey = process.env.ELEVENLABS_API_KEY;
// SFX v3: sigue mejor los prompts con varias partes y suena más natural (skill oficial de ElevenLabs).
const model = process.env.ELEVENLABS_SFX_MODEL || 'eleven_text_to_sound_v3';
const dryRun = hasFlag('--dry-run');
const force = hasFlag('--force');
/** Sin los bucles de ambiente (son lo más caro: largos y se usan en fases posteriores). */
const noLoops = hasFlag('--no-loops');
const only = (argValue('--only') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const candidatesOverride = argValue('--candidates') ? Number(argValue('--candidates')) : undefined;
const concurrency = Math.max(1, Number(argValue('--concurrency') ?? 3));

const sounds = loadManifest();
const lock = readLock();

const todo = [...sounds.values()].filter((d) => {
  if (d.source !== 'elevenlabs' || !matchesOnly(d.id, only)) return false;
  if (noLoops && d.loop) return false;
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
  console.error('Falta ELEVENLABS_API_KEY (en el entorno, .env.local o .env de la raíz). Ejecuta: npx -y @elevenlabs/cli@latest onboard init');
  process.exit(1);
}

// El SDK lee ELEVENLABS_API_KEY del entorno (cargado por loadEnv); la key nunca va en el código.
const client = new ElevenLabsClient();

async function generateOne(def: SoundDef, attempt = 0): Promise<Buffer> {
  try {
    const stream = await client.textToSoundEffects.convert({
      text: def.prompt,
      modelId: model,
      durationSeconds: def.duration,
      promptInfluence: def.promptInfluence,
      loop: def.loop || undefined,
      outputFormat: OUTPUT_FORMAT,
    });
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) chunks.push(chunk);
    return Buffer.concat(chunks);
  } catch (err) {
    const status = err instanceof ElevenLabsError ? err.statusCode : undefined;
    if (status === 429 || (status !== undefined && status >= 500)) {
      if (attempt >= 4) throw new Error(`${def.id}: HTTP ${status} tras ${attempt + 1} intentos`);
      const wait = 2000 * 2 ** attempt;
      console.warn(`  ${def.id}: HTTP ${status}, reintento en ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
      return generateOne(def, attempt + 1);
    }
    const detail = err instanceof ElevenLabsError ? JSON.stringify(err.body ?? err.message).slice(0, 300) : (err as Error).message;
    throw new Error(`${def.id}: HTTP ${status ?? '?'} ${detail}`);
  }
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
