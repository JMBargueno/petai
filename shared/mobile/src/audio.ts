/**
 * Sonido de la app móvil (spec 40). Mismo motor que el escritorio y que los bundles de la
 * escena y los minijuegos (`@pockai/audio`); aquí se le conecta a la biblioteca de pantallas:
 *
 * - `setUiSound`: los juegos compartidos (Cocina, Minijuegos) piden sus efectos por id.
 * - `onUiFeedback`: los momentos del kit (abrir un modal, ganar monedas o gemas).
 *
 * Solo se empaquetan los sonidos que piden esas pantallas (`cook.*`, `mg.*`, `elem.*` y los de
 * interfaz, unos 700 KB): la música y los ambientes del escritorio no entran en el paquete del
 * móvil. Un id sin fichero simplemente no suena. Los ajustes se guardan en el dispositivo
 * (`localStorage`) y se cambian en Cuenta con `SoundSettingsView` (solo efectos e interfaz: lo que
 * suena en el móvil).
 *
 * Android e iOS comparten todo esto: la plataforma solo decide los valores de partida de los
 * ajustes, y hoy son los mismos en las dos (solo el escritorio se aparta).
 */
import { writable, get } from 'svelte/store';
import { normalizeManifest, parseAudioSettings, SoundEngine, sourcesFromFiles, type AudioSettings } from '@pockai/audio';
import { onUiFeedback, setUiSound, type UiFeedback } from '@pockai/ui';
import soundsJson from '../../../shared/game-data/sounds.json';
import type { MobilePlatform } from './config';

export const AUDIO_STORAGE_KEY = 'pockai_audio';

/** La plataforma de esta app. La fija `installSound`; antes de eso valen los ajustes del móvil. */
let platform: MobilePlatform = 'android';

function loadSettings(): AudioSettings {
  try {
    return parseAudioSettings(localStorage.getItem(AUDIO_STORAGE_KEY), platform);
  } catch {
    return parseAudioSettings(null, platform);
  }
}

/** Los ajustes de sonido del dispositivo. */
export const audioSettings = writable<AudioSettings>(loadSettings());

/** Cambia los ajustes (todos o parte), los aplica al motor y los recuerda. */
export function updateAudioSettings(patch: Partial<AudioSettings>): void {
  const cur = get(audioSettings);
  const next = parseAudioSettings(
    { ...cur, ...patch, buses: { ...cur.buses, ...patch.buses }, busOn: { ...cur.busOn, ...patch.busOn } },
    platform,
  );
  audioSettings.set(next);
  engine?.setSettings(next);
  try {
    localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* almacenamiento indisponible: vale para esta sesión */
  }
}

/** Una muestra de un tipo de sonido (al cambiar su volumen). */
export const previewSound = (id: string) => void getEngine().play(id);

let engine: SoundEngine | null = null;

/** El motor (se crea al primer sonido; el WebView exige un gesto antes de que suene). */
function getEngine(): SoundEngine {
  if (engine) return engine;
  const { manifest } = normalizeManifest(soundsJson);
  const files = {
    ...import.meta.glob<string>('../../../shared/assets/audio/sfx/{cook,mg,elem}.*.{m4a,mp3,ogg}', { query: '?url', import: 'default', eager: true }),
    ...import.meta.glob<string>('../../../shared/assets/audio/ui/*.{m4a,mp3,ogg}', { query: '?url', import: 'default', eager: true }),
  };
  // Si el bundler no encontró los sonidos, la app quedaría muda sin un solo error: mejor decirlo.
  if (Object.keys(files).length === 0) console.warn('[sonido] no se empaquetó ningún fichero de audio');
  // `scene`: los sonidos sin plataforma del manifiesto (los del escritorio no le tocan).
  engine = new SoundEngine({ manifest, sources: sourcesFromFiles(files), settings: get(audioSettings), platform: 'scene' });
  engine.attachAutoUnlock();
  engine.attachWindowState();
  return engine;
}

/** Sonidos de los momentos del kit: los mismos ids que en el escritorio. */
const UI_SOUNDS: Record<UiFeedback, string> = {
  modalOpen: 'ui.modal_open',
  modalClose: 'ui.modal_close',
  coinGain: 'ui.coin_gain',
  gemGain: 'ui.gem_gain',
};

/** Conecta el sonido a la biblioteca de pantallas. Se llama una vez al arrancar. */
export function installSound(appPlatform: MobilePlatform = 'android'): void {
  platform = appPlatform;
  audioSettings.set(loadSettings());
  setUiSound({
    sfx: (id, opts) => getEngine().play(id, opts),
    loop: (id, opts) => getEngine().loop(id, opts),
    stopLoop: (key, fadeMs) => engine?.stopLoop(key, fadeMs),
  });
  onUiFeedback((kind) => void getEngine().play(UI_SOUNDS[kind]));
  // El contexto de audio se desbloquea con el primer toque: se crea ya para engancharlo a tiempo.
  getEngine();
}
