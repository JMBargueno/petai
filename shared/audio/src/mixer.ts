/**
 * Mezclador del reproductor MP3 (spec 42): un tema lofi en bucle y capas de ambiente (lluvia,
 * trueno, viento, grillos, pájaros) que se suman, cada una con su volumen.
 *
 * Funciones puras sobre un estado serializable (se guarda en local para recordar la mezcla) y un
 * `syncMixer` que lleva ese estado al motor con el mínimo de cambios: arranca lo que falta, para
 * lo que sobra y ajusta volúmenes.
 */
import type { SoundEngine } from './engine';

export const MIXER_TRACKS = ['music.lofi.night', 'music.lofi.tea', 'music.lofi.bits'] as const;
export type MixerTrack = (typeof MIXER_TRACKS)[number];

export const MIXER_LAYERS = ['rain', 'thunder', 'wind', 'crickets', 'birds'] as const;
export type MixerLayer = (typeof MIXER_LAYERS)[number];

/** Id del sonido de cada capa en sounds.json. */
export const layerSoundId = (layer: MixerLayer): string => `amb.mixer.${layer}`;

export interface MixerState {
  /** Suena (pausa = false, pero se recuerda la mezcla). */
  playing: boolean;
  /** Tema lofi elegido, o null para solo ambiente. */
  track: MixerTrack | null;
  /** Volumen del tema, 0–1. */
  trackVolume: number;
  /** Capas encendidas con su volumen (0–1). Una capa apagada no está en el mapa. */
  layers: Partial<Record<MixerLayer, number>>;
}

export const DEFAULT_LAYER_VOLUME = 0.6;

export const emptyMixer = (): MixerState => ({ playing: false, track: null, trackVolume: 0.8, layers: {} });

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

export function setTrack(s: MixerState, track: MixerTrack | null): MixerState {
  return { ...s, track, playing: track ? true : s.playing };
}

/** Siguiente tema de la lista (vuelve al primero). Lo usa el Pockai al tocar el MP3. */
export function nextTrack(s: MixerState): MixerState {
  const i = s.track ? MIXER_TRACKS.indexOf(s.track) : -1;
  return setTrack(s, MIXER_TRACKS[(i + 1) % MIXER_TRACKS.length]);
}

export function setTrackVolume(s: MixerState, volume: number): MixerState {
  return { ...s, trackVolume: clamp01(volume) };
}

/** Enciende o apaga una capa. Encender una capa con el reproductor parado lo pone en marcha. */
export function toggleLayer(s: MixerState, layer: MixerLayer, on?: boolean): MixerState {
  const isOn = s.layers[layer] !== undefined;
  const want = on ?? !isOn;
  if (want === isOn) return s;
  const layers = { ...s.layers };
  if (want) layers[layer] = DEFAULT_LAYER_VOLUME;
  else delete layers[layer];
  return { ...s, layers, playing: want ? true : s.playing };
}

export function setLayerVolume(s: MixerState, layer: MixerLayer, volume: number): MixerState {
  if (s.layers[layer] === undefined) return s;
  return { ...s, layers: { ...s.layers, [layer]: clamp01(volume) } };
}

export function setPlaying(s: MixerState, playing: boolean): MixerState {
  return { ...s, playing };
}

/** Hay algo que reproducir (un tema o alguna capa). */
export const hasContent = (s: MixerState): boolean => !!s.track || Object.keys(s.layers).length > 0;

/** Suena algo de verdad ahora mismo. */
export const isAudible = (s: MixerState): boolean => s.playing && hasContent(s);

/** Valida un estado que viene del almacenamiento. */
export function parseMixer(raw: unknown): MixerState {
  const d = emptyMixer();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d;
  const r = raw as Record<string, unknown>;
  const track = typeof r.track === 'string' && (MIXER_TRACKS as readonly string[]).includes(r.track) ? (r.track as MixerTrack) : null;
  const layers: MixerState['layers'] = {};
  const rl = r.layers && typeof r.layers === 'object' ? (r.layers as Record<string, unknown>) : {};
  for (const l of MIXER_LAYERS) if (typeof rl[l] === 'number') layers[l] = clamp01(rl[l] as number);
  return {
    // Al abrir la app no arranca solo: el usuario pulsa play (los navegadores lo exigen además)
    playing: false,
    track,
    trackVolume: typeof r.trackVolume === 'number' ? clamp01(r.trackVolume) : d.trackVolume,
    layers,
  };
}

/** Claves de los loops del mezclador en el motor. */
export const MIXER_KEY_PREFIX = 'mixer:';
const trackKey = (t: MixerTrack) => `${MIXER_KEY_PREFIX}track:${t}`;
const layerKey = (l: MixerLayer) => `${MIXER_KEY_PREFIX}layer:${l}`;

/** Loops que deberían sonar: clave → id del sonido y volumen. */
export function wantedLoops(s: MixerState): Map<string, { id: string; volume: number }> {
  const out = new Map<string, { id: string; volume: number }>();
  if (!s.playing) return out;
  if (s.track) out.set(trackKey(s.track), { id: s.track, volume: s.trackVolume });
  for (const l of MIXER_LAYERS) {
    const v = s.layers[l];
    if (v !== undefined) out.set(layerKey(l), { id: layerSoundId(l), volume: v });
  }
  return out;
}

type MixerEngine = Pick<SoundEngine, 'loop' | 'stopLoop' | 'setLoopVolume' | 'activeLoops'>;

/** Lleva el estado al motor: para lo que sobra, arranca lo que falta y ajusta volúmenes. */
export function syncMixer(engine: MixerEngine, s: MixerState, fadeMs = 900): void {
  const want = wantedLoops(s);
  for (const key of engine.activeLoops()) {
    if (key.startsWith(MIXER_KEY_PREFIX) && !want.has(key)) engine.stopLoop(key, fadeMs);
  }
  const active = new Set(engine.activeLoops());
  for (const [key, { id, volume }] of want) {
    if (active.has(key)) engine.setLoopVolume(key, volume);
    else engine.loop(id, { key, fadeMs, volume, player: true });
  }
}
