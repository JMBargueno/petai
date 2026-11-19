import { derived } from 'svelte/store';
import { isAudible } from '@pockai/audio';
import { mixerStore } from '../mixer';
import type { ErrandKind, EtherWant } from './director';

/** Id del reproductor MP3 entre los objetos del Éter (solo hay uno). */
export const MP3_PLAYER_ID = 'mp3-player';

/**
 * Lo que debe verse del MP3 (spec 42): fuera mientras suene algo y de vuelta al Éter al pausar (el
 * panel sigue mostrando la mezcla). Cambiar de tema cambia el estado, así que el Pockai lo toca. El
 * mezclador cambia al instante; el objeto (y el Pockai) lo siguen a su ritmo.
 */
export const mp3PlayerWant = derived<typeof mixerStore, EtherWant>(mixerStore, (s) =>
  isAudible(s) ? `playing:${s.track ?? 'ambient'}` : null,
);

/** Lo que dice el Pockai al tocar el MP3. */
export function mp3PlayerLine(kind: ErrandKind, to: EtherWant): string | null {
  if (kind === 'summon') return '🎧 ¡Música!';
  if (to === null) return '🌀 Silencio. Lo guardo en el Éter.';
  if (typeof to === 'string' && to.startsWith('playing:')) return '🎶 ¡Cambio de tema!';
  return null;
}
