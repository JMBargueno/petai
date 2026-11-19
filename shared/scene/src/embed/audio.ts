/**
 * Motor de sonido del bundle embed (WebView de Android e iOS), spec 40. El escritorio no usa este
 * fichero: tiene el suyo en desktop/src/lib/audio.ts.
 *
 * La app nativa manda los ajustes con `setAudio`; hasta entonces suena con los valores por defecto
 * del móvil. El audio se desbloquea con el primer toque (lo exige el WebView).
 */
import { defaultAudioSettings, normalizeManifest, SoundEngine, sourcesFromFiles } from '@pockai/audio';
import soundsJson from '../../../game-data/sounds.json';

let engine: SoundEngine | null = null;

export function getEmbedAudio(): SoundEngine {
  if (engine) return engine;
  const { manifest } = normalizeManifest(soundsJson);
  const files = import.meta.glob<string>('../../../assets/audio/**/*.{m4a,mp3,ogg}', {
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
