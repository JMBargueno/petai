/**
 * Reproductor MP3 del escritorio (spec 42): el estado del mezclador (`@pockai/audio`), guardado en
 * local para recordar la mezcla, y llevado al motor de sonido de la ventana cada vez que cambia.
 *
 * La música del reproductor la pone el usuario a propósito, así que sigue sonando con la mascota
 * suelta en el escritorio (ver `playerBusGain`). Solo funciona con la habilidad `ambient_mixer`
 * activa, que se desbloquea con el mueble MP3 del hábitat.
 */
import { get, writable } from 'svelte/store';
import {
  emptyMixer,
  nextTrack,
  parseMixer,
  setLayerVolume,
  setPlaying,
  setTrack,
  setTrackVolume,
  syncMixer,
  toggleLayer,
  hasContent,
  type MixerLayer,
  type MixerState,
  type MixerTrack,
} from '@pockai/audio';
import { getSoundEngine } from './audio';

export const MIXER_STORAGE_KEY = 'pockai_mixer';

export const TRACK_LABEL: Record<MixerTrack, string> = {
  'music.lofi.night': 'Noche tranquila',
  'music.lofi.tea': 'Tarde de té',
  'music.lofi.bits': 'Lluvia de bits',
};

export const LAYER_LABEL: Record<MixerLayer, { label: string; icon: string }> = {
  rain: { label: 'Lluvia', icon: 'rain' },
  thunder: { label: 'Trueno', icon: 'thunder' },
  wind: { label: 'Viento', icon: 'wind' },
  crickets: { label: 'Grillos', icon: 'moon' },
  birds: { label: 'Pájaros', icon: 'bird' },
};

function load(): MixerState {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(MIXER_STORAGE_KEY) : null;
    return raw ? parseMixer(JSON.parse(raw)) : emptyMixer();
  } catch {
    return emptyMixer();
  }
}

export const mixerStore = writable<MixerState>(load());

let enabled = false;

function apply(s: MixerState) {
  try {
    localStorage.setItem(MIXER_STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* sin almacenamiento: vale para esta sesión */
  }
  // Sin la habilidad (sin MP3 o apagada) no suena nada, aunque se recuerde la mezcla
  syncMixer(getSoundEngine(), enabled ? s : setPlaying(s, false));
}

mixerStore.subscribe((s) => {
  if (typeof window !== 'undefined') apply(s);
});

/** La habilidad `ambient_mixer` está activa (PetView/App lo mantienen al día). */
export function setMixerEnabled(on: boolean) {
  if (on === enabled) return;
  enabled = on;
  if (!on) mixerStore.update((s) => setPlaying(s, false));
  else apply(get(mixerStore));
}

function notify(action: 'play' | 'pause' | 'track') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('petai:mixer_event', { detail: { action } }));
}

/** Desbloquea el audio (gesto del usuario) y arranca el motor si hacía falta. */
function unlock() {
  void getSoundEngine().unlock();
}

export function mixerTogglePlay() {
  unlock();
  const s = get(mixerStore);
  // Sin nada elegido, el play pone el primer tema
  const next = s.playing ? setPlaying(s, false) : hasContent(s) ? setPlaying(s, true) : nextTrack(s);
  mixerStore.set(next);
  notify(next.playing ? 'play' : 'pause');
}

export function mixerPlay(track?: MixerTrack | null, layers?: MixerLayer[]) {
  unlock();
  mixerStore.update((s) => {
    let n = track !== undefined ? setTrack(s, track) : s;
    if (layers) for (const l of layers) n = toggleLayer(n, l, true);
    if (!hasContent(n)) n = nextTrack(n);
    return setPlaying(n, true);
  });
  notify('play');
}

export function mixerStop() {
  mixerStore.update((s) => setPlaying(s, false));
  notify('pause');
}

export function mixerNextTrack() {
  unlock();
  mixerStore.update((s) => nextTrack(s));
  notify('track');
}

export function mixerSetTrack(track: MixerTrack | null) {
  unlock();
  mixerStore.update((s) => setTrack(s, track));
  notify('track');
}

export const mixerSetTrackVolume = (v: number) => mixerStore.update((s) => setTrackVolume(s, v));
export function mixerToggleLayer(layer: MixerLayer) {
  unlock();
  mixerStore.update((s) => toggleLayer(s, layer));
}
export const mixerSetLayerVolume = (layer: MixerLayer, v: number) => mixerStore.update((s) => setLayerVolume(s, layer, v));
