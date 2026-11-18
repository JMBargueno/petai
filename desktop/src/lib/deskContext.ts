import { get, writable } from 'svelte/store';
import type { AppCategory } from './contextAwareness';
import { pomodoroStore } from './pomodoro';

/**
 * Contexto en vivo del escritorio que acompaña a cada mensaje del chat, para que la mascota
 * sepa dónde está y qué haces. Privacidad: solo categorías y números, nunca títulos de ventana.
 * El servidor vuelve a filtrar cada dato según la habilidad que lo protege.
 */

export type PetPose = 'walking' | 'climbing' | 'perched' | 'sleeping';

/** Lo escribe PetView mientras la mascota se mueve por la pantalla. */
export const deskState = writable<{ appCategory: AppCategory | null; pose: PetPose }>({
  appCategory: null,
  pose: 'walking',
});

export interface ClientContext {
  appCategory?: AppCategory;
  pose?: PetPose;
  pomodoro?: { phase: 'idle' | 'work' | 'break'; minutesLeft?: number; sessionsToday?: number };
}

export function buildClientContext(): ClientContext {
  const desk = get(deskState);
  const pomo = get(pomodoroStore);
  const ctx: ClientContext = { pose: desk.pose };
  if (desk.appCategory) ctx.appCategory = desk.appCategory;
  ctx.pomodoro = {
    phase: pomo.phase,
    sessionsToday: pomo.sessionsCompleted,
    ...(pomo.phase !== 'idle' ? { minutesLeft: Math.ceil(pomo.timeLeft / 60) } : {}),
  };
  return ctx;
}
