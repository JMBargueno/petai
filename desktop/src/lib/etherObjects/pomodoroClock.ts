import { derived } from 'svelte/store';
import { pomodoroStore } from '../pomodoro';
import type { ErrandKind, EtherWant } from './director';

/** Id del reloj del pomodoro entre los objetos del Éter (solo hay uno). */
export const POMODORO_CLOCK_ID = 'pomodoro-clock';

/**
 * Lo que debe verse del reloj según el pomodoro: fuera mientras haya sesión, en marcha o en pausa.
 * La store del pomodoro cambia al instante; el reloj (y el Pockai) la siguen a su ritmo.
 */
export const pomodoroClockWant = derived<typeof pomodoroStore, EtherWant>(pomodoroStore, (s) =>
  s.phase === 'idle' ? null : s.isRunning ? 'running' : 'paused',
);

/** Lo que dice el Pockai al tocar el reloj (al sacarlo ya habla el aviso de «¡A trabajar!»). */
export function pomodoroClockLine(kind: ErrandKind, to: EtherWant): string | null {
  if (kind === 'summon') return null;
  if (to === 'paused') return '⏸ Reloj en pausa. Aquí te espero.';
  if (to === 'running') return '▶ ¡Seguimos!';
  if (to === null) return '🌀 De vuelta al Éter.';
  return null;
}
