/** Utilidades compartidas por los scripts de sonido (generate, review, import). */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { normalizeManifest, type SoundDef } from '../../shared/audio/src/manifest';

export const ROOT = resolve(__dirname, '../..');
export const MANIFEST_PATH = join(ROOT, 'shared/game-data/sounds.json');
export const AUDIO_DIR = join(ROOT, 'shared/assets/audio');
export const CANDIDATES_DIR = join(ROOT, 'scripts/sfx/.candidates');
export const LOCK_PATH = join(ROOT, 'scripts/sfx/sounds.lock.json');
export const SELECTION_PATH = join(CANDIDATES_DIR, 'selection.json');

export function loadManifest(): Map<string, SoundDef> {
  const { manifest, errors } = normalizeManifest(JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')));
  if (errors.length) {
    for (const e of errors) console.error(`✗ ${e}`);
    throw new Error('sounds.json no es válido (pnpm validate:sounds)');
  }
  return manifest.sounds;
}

/** Lo que, si cambia, obliga a regenerar las tomas de un sonido. */
export function generationHash(def: SoundDef): string {
  const key = JSON.stringify([def.prompt, def.duration, def.loop, def.promptInfluence]);
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}

export interface LockEntry {
  hash: string;
  candidates: number;
  generatedAt: string;
}

export function readLock(): Record<string, LockEntry> {
  return existsSync(LOCK_PATH) ? JSON.parse(readFileSync(LOCK_PATH, 'utf8')) : {};
}

export function writeLock(lock: Record<string, LockEntry>): void {
  const sorted = Object.fromEntries(Object.entries(lock).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(LOCK_PATH, JSON.stringify(sorted, null, 2) + '\n');
}

/** Selección de tomas hecha en la página de revisión: id → índices de candidato (0-based). */
export type Selection = Record<string, number[]>;

export function readSelection(): Selection {
  return existsSync(SELECTION_PATH) ? JSON.parse(readFileSync(SELECTION_PATH, 'utf8')) : {};
}

/** Filtra por prefijos `--only ui,pet.eat` (sin filtro, todos). */
export function matchesOnly(id: string, only: string[]): boolean {
  return only.length === 0 || only.some((p) => id === p || id.startsWith(p.endsWith('.') ? p : `${p}.`));
}

export function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export const hasFlag = (name: string) => process.argv.includes(name);

/**
 * Lee `.env.local` y `.env` de la raíz si existen (Node 22). `loadEnvFile` no pisa lo ya definido,
 * así que manda el entorno, luego `.env.local` (donde la deja la CLI de ElevenLabs) y luego `.env`.
 * La key nunca se imprime.
 */
export function loadEnv(): void {
  for (const name of ['.env.local', '.env']) {
    const p = join(ROOT, name);
    if (!existsSync(p)) continue;
    try {
      process.loadEnvFile(p);
    } catch {
      /* formato no soportado: se usa solo el entorno */
    }
  }
}
