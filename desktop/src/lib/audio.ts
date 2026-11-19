/**
 * Sonido del escritorio (spec 40): ajustes guardados en localStorage y un único motor
 * `@pockai/audio` para la ventana.
 *
 * El escritorio es una sola ventana transparente con la mascota y el panel. Con el panel abierto y
 * la ventana con foco se oye todo (`app`); si no, la mascota vive en el escritorio (`desktop`) y
 * solo suenan ella y sus efectos (y el ambiente si se permite). Ver `effectiveBusGain`.
 *
 * Los ficheros salen de shared/assets/audio (se generan con `pnpm sfx:generate`): un id sin fichero
 * simplemente no suena, así que se puede cablear `sfx('…')` antes de tener el sonido.
 */
import { get, writable } from 'svelte/store';
import {
  normalizeManifest,
  parseAudioSettings,
  SoundEngine,
  sourcesFromFiles,
  type AudioSettings,
  type LoopOptions,
  type PlayOptions,
} from '@pockai/audio';
import soundsJson from '@shared/game-data/sounds.json';

export const AUDIO_STORAGE_KEY = 'pockai_audio';

type ReadStorage = Pick<Storage, 'getItem'>;
type WriteStorage = Pick<Storage, 'setItem'>;

function defaultStorage(): Storage | undefined {
  return typeof localStorage !== 'undefined' ? localStorage : undefined;
}

export function loadAudioSettings(storage: ReadStorage | undefined = defaultStorage()): AudioSettings {
  try {
    return parseAudioSettings(storage?.getItem(AUDIO_STORAGE_KEY) ?? null, 'desktop');
  } catch {
    return parseAudioSettings(null, 'desktop');
  }
}

export const audioSettings = writable<AudioSettings>(loadAudioSettings());

/** Cambia los ajustes (todos o parte), los aplica al motor y los recuerda. */
export function updateAudioSettings(
  patch: Partial<AudioSettings>,
  storage: WriteStorage | undefined = defaultStorage(),
): AudioSettings {
  const next = parseAudioSettings({ ...get(audioSettings), ...patch, buses: { ...get(audioSettings).buses, ...patch.buses } }, 'desktop');
  audioSettings.set(next);
  engine?.setSettings(next);
  try {
    storage?.setItem(AUDIO_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* almacenamiento indisponible: vale para esta sesión */
  }
  return next;
}

let engine: SoundEngine | null = null;
let panelOpen = true;

function syncSurface() {
  if (!engine || typeof document === 'undefined') return;
  const focused = document.hasFocus();
  engine.setEnv({ focused, surface: panelOpen && focused ? 'app' : 'desktop' });
}

/** El motor de la ventana (se crea al primer uso; en tests o sin WebAudio no hace nada). */
export function getSoundEngine(): SoundEngine {
  if (engine) return engine;
  const { manifest, errors } = normalizeManifest(soundsJson);
  if (errors.length && import.meta.env.DEV) console.warn('[audio] sounds.json:', errors);
  const files = import.meta.glob<string>('@shared/assets/audio/**/*.{m4a,mp3,ogg}', {
    query: '?url',
    import: 'default',
    eager: true,
  });
  engine = new SoundEngine({
    manifest,
    sources: sourcesFromFiles(files),
    settings: get(audioSettings),
    platform: 'desktop',
  });
  if (typeof window !== 'undefined') {
    engine.attachAutoUnlock();
    engine.attachWindowState();
    window.addEventListener('focus', syncSurface);
    window.addEventListener('blur', syncSurface);
    // Otra ventana o pestaña (modo navegador) cambió los ajustes.
    window.addEventListener('storage', (e) => {
      if (e.key === AUDIO_STORAGE_KEY) {
        const s = loadAudioSettings();
        audioSettings.set(s);
        engine?.setSettings(s);
      }
    });
  }
  syncSurface();
  return engine;
}

/** El panel se abre o se cierra (App.svelte). */
export function setPanelOpen(open: boolean) {
  panelOpen = open;
  syncSurface();
}

/**
 * Solo en desarrollo: últimos sonidos pedidos (suenen o no) en `window.__pockaiSfx`, para comprobar
 * el cableado antes de tener los ficheros. `window.__pockaiSfx.length = 0` lo vacía.
 */
function trace(id: string, played: boolean) {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;
  const w = window as unknown as { __pockaiSfx?: { id: string; played: boolean; at: number }[] };
  const log = (w.__pockaiSfx ??= []);
  log.push({ id, played, at: Math.round(performance.now()) });
  if (log.length > 100) log.shift();
}

/** Dispara un sonido del manifiesto. */
export function sfx(id: string, opts?: PlayOptions): boolean {
  const played = getSoundEngine().play(id, opts);
  trace(id, played);
  return played;
}

export function sfxLoop(id: string, opts?: LoopOptions): boolean {
  const played = getSoundEngine().loop(id, opts);
  trace(`loop:${id}`, played);
  return played;
}

export function sfxStopLoop(key: string, fadeMs?: number) {
  engine?.stopLoop(key, fadeMs);
}
