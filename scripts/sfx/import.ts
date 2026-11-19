#!/usr/bin/env tsx
/**
 * Pasa las tomas elegidas en `pnpm sfx:review` a shared/assets/audio, ya procesadas con ffmpeg:
 *   - one-shots: recorta silencio al principio y al final;
 *   - normaliza el volumen por bus (UI −20 LUFS, Pockai y efectos −16, ambiente −24);
 *   - AAC en .m4a (WebView2, Android WebView y WKWebView lo reproducen): mono 96 kbps salvo el
 *     ambiente, que va en estéreo a 128 kbps.
 *
 *   pnpm sfx:import              # todo lo seleccionado
 *   pnpm sfx:import --only ui
 *
 * Necesita ffmpeg en el PATH (o FFMPEG=/ruta/ffmpeg).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { assetPath, type Bus } from '../../shared/audio/src/manifest';
import { argValue, AUDIO_DIR, CANDIDATES_DIR, loadManifest, matchesOnly, readSelection } from './common';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const only = (argValue('--only') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const LUFS: Record<Bus, number> = { ui: -20, sfx: -16, pet: -16, ambient: -24, music: -18 };

const check = spawnSync(FFMPEG, ['-version'], { encoding: 'utf8' });
if (check.status !== 0) {
  console.error('No encuentro ffmpeg. Instálalo o indica la ruta con FFMPEG=...');
  process.exit(1);
}

const sounds = loadManifest();
const selection = readSelection();
let imported = 0;
let failed = 0;

for (const [id, picks] of Object.entries(selection)) {
  const def = sounds.get(id);
  if (!def || !matchesOnly(id, only) || picks.length === 0) continue;
  if (def.source !== 'elevenlabs') continue;
  // Borra las tomas anteriores de este id para que no queden huérfanas.
  const busDir = join(AUDIO_DIR, def.bus);
  if (existsSync(busDir)) {
    for (const f of readdirSync(busDir)) if (f.startsWith(`${id}_`)) rmSync(join(busDir, f));
  }
  picks.slice(0, def.variants).forEach((cand, i) => {
    const input = join(CANDIDATES_DIR, id, `${cand + 1}.mp3`);
    const output = join(AUDIO_DIR, assetPath(def, i));
    if (!existsSync(input)) {
      console.error(`✗ ${id}: falta la toma ${cand + 1}`);
      failed++;
      return;
    }
    mkdirSync(dirname(output), { recursive: true });
    const filters: string[] = [];
    if (!def.loop) {
      const trim = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.01';
      // Recorta silencio por delante, da la vuelta y recorta por detrás; microfundidos contra clics.
      filters.push(trim, 'afade=t=in:d=0.005', 'areverse', trim, 'afade=t=in:d=0.02', 'areverse');
    }
    if (def.bus === 'music') {
      // Temas del MP3 (spec 42): la API de música no da bucles perfectos; un fundido corto en cada
      // extremo hace que el empalme del bucle sea una respiración y no un golpe.
      filters.push('afade=t=in:d=0.6', 'areverse', 'afade=t=in:d=1.2', 'areverse');
    }
    filters.push(`loudnorm=I=${LUFS[def.bus]}:TP=-1.5:LRA=11`);
    const stereo = def.bus === 'ambient' || def.bus === 'music';
    const args = [
      '-hide_banner', '-loglevel', 'error', '-y', '-i', input,
      '-af', filters.join(','),
      '-ar', '44100', '-ac', stereo ? '2' : '1',
      '-c:a', 'aac', '-b:a', stereo ? '128k' : '96k',
      output,
    ];
    const r = spawnSync(FFMPEG, args, { encoding: 'utf8' });
    if (r.status !== 0) {
      console.error(`✗ ${id}: ffmpeg falló\n${r.stderr}`);
      failed++;
      return;
    }
    imported++;
  });
  console.log(`✓ ${id} (${Math.min(picks.length, def.variants)} toma/s)`);
}

console.log(`${imported} fichero(s) en shared/assets/audio${failed ? `, ${failed} fallo(s)` : ''}. Comprueba con: pnpm validate:sounds`);
if (failed) process.exit(1);
