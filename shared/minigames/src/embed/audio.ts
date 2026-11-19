/**
 * Motor de sonido del bundle embed de minijuegos (WebView de Android e iOS), spec 40. Mismo patrón
 * que el de la escena (shared/scene/src/embed/audio.ts). El escritorio no usa este fichero: pasa su
 * propio motor a `mountMinigame`.
 *
 * La app nativa manda los ajustes con `setAudio`; hasta entonces suena con los valores por defecto
 * del móvil. El audio se desbloquea con el primer toque (lo exige el WebView). Solo se empaquetan
 * los sonidos de minijuegos (`mg.*`): los demás no suenan aquí.
 */
import { defaultAudioSettings, normalizeManifest, parseAudioSettings, SoundEngine, sourcesFromFiles } from '@pockai/audio';
import soundsJson from '../../../game-data/sounds.json';
import type { MinigameSound } from '../sound';

let engine: SoundEngine | null = null;

export function getEmbedAudio(): SoundEngine {
  if (engine) return engine;
  const { manifest } = normalizeManifest(soundsJson);
  const files = import.meta.glob<string>('../../../assets/audio/sfx/mg.*.{m4a,mp3,ogg}', {
    query: '?url',
    import: 'default',
    eager: true,
  });
  engine = new SoundEngine({
    manifest,
    sources: sourcesFromFiles(files),
    settings: defaultAudioSettings('android'),
    platform: 'scene',
  });
  engine.attachAutoUnlock();
  engine.attachWindowState();
  return engine;
}

/** Aplica los ajustes que manda la app (`setAudio`), validándolos. */
export function setEmbedAudioSettings(raw: unknown) {
  getEmbedAudio().setSettings(parseAudioSettings(raw, 'android'));
}

/**
 * El sonido que el embed le da a cada partida. En desarrollo guarda en `window.__pockaiSfx` los
 * últimos sonidos pedidos (suenen o no), igual que el escritorio: así se comprueba el cableado antes
 * de tener los ficheros.
 */
export function embedSound(): MinigameSound {
  const audio = getEmbedAudio();
  if (!import.meta.env.DEV) return audio;
  const trace = (id: string, played: boolean) => {
    const w = window as unknown as { __pockaiSfx?: { id: string; played: boolean }[] };
    const log = (w.__pockaiSfx ??= []);
    log.push({ id, played });
    if (log.length > 400) log.shift();
  };
  return {
    play: (id, opts) => trace(id, audio.play(id, opts)),
    loop: (id, opts) => trace(`loop:${id}`, audio.loop(id, opts)),
    stopLoop: (key, fadeMs) => audio.stopLoop(key, fadeMs),
  };
}
