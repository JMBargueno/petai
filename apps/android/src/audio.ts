/**
 * Sonido de la app de Android (spec 40). Mismo motor que el escritorio y que los bundles de la
 * escena y los minijuegos (`@pockai/audio`); aquí se le conecta a la biblioteca de pantallas:
 *
 * - `setUiSound`: los juegos compartidos (Cocina, Minijuegos) piden sus efectos por id.
 * - `onUiFeedback`: los momentos del kit (abrir un modal, ganar monedas o gemas).
 *
 * Solo se empaquetan los sonidos que piden esas pantallas (`cook.*`, `mg.*`, `elem.*` y los de
 * interfaz, unos 760 KB): la música y los ambientes del escritorio no entran en el APK. Un id sin
 * fichero simplemente no suena. Los ajustes se guardan en el dispositivo (`localStorage`); la app
 * aún no tiene pantalla para cambiarlos y suena con los valores por defecto del móvil.
 */
import { normalizeManifest, parseAudioSettings, SoundEngine, sourcesFromFiles, type AudioSettings } from '@pockai/audio';
import { onUiFeedback, setUiSound, type UiFeedback } from '@pockai/ui';
import soundsJson from '../../../shared/game-data/sounds.json';

export const AUDIO_STORAGE_KEY = 'pockai_audio';

function loadSettings(): AudioSettings {
  try {
    return parseAudioSettings(localStorage.getItem(AUDIO_STORAGE_KEY), 'android');
  } catch {
    return parseAudioSettings(null, 'android');
  }
}

let engine: SoundEngine | null = null;

/** El motor (se crea al primer sonido; el WebView exige un gesto antes de que suene). */
function getEngine(): SoundEngine {
  if (engine) return engine;
  const { manifest } = normalizeManifest(soundsJson);
  const files = {
    ...import.meta.glob<string>('../../../shared/assets/audio/sfx/{cook,mg,elem}.*.{m4a,mp3,ogg}', { query: '?url', import: 'default', eager: true }),
    ...import.meta.glob<string>('../../../shared/assets/audio/ui/*.{m4a,mp3,ogg}', { query: '?url', import: 'default', eager: true }),
  };
  // `scene`: los sonidos sin plataforma del manifiesto (los del escritorio no le tocan).
  engine = new SoundEngine({ manifest, sources: sourcesFromFiles(files), settings: loadSettings(), platform: 'scene' });
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
export function installSound(): void {
  setUiSound({
    sfx: (id, opts) => getEngine().play(id, opts),
    loop: (id, opts) => getEngine().loop(id, opts),
    stopLoop: (key, fadeMs) => engine?.stopLoop(key, fadeMs),
  });
  onUiFeedback((kind) => void getEngine().play(UI_SOUNDS[kind]));
  // El contexto de audio se desbloquea con el primer toque: se crea ya para engancharlo a tiempo.
  getEngine();
}
