import { writable } from 'svelte/store';

/**
 * Visita en vivo en curso (tu Pockai está en el hábitat de un amigo).
 *
 * Vive fuera del componente de Visitas: al cambiar de pestaña el componente se desmonta y, si el
 * estado fuera local, el botón «Terminar visita» desaparecería con la visita todavía activa.
 * Al cargar el historial se recupera también de ahí, por si la app se reinició a mitad.
 */
export const activeVisit = writable<string>('');

export type VisitLog = {
  kind?: string;
  direction?: string;
  otherUserId?: string;
  otherName?: string;
  endedAt?: string | null;
  createdAt: string;
};

/** Antigüedad máxima para dar una visita sin `endedAt` por viva (el servidor las cierra solo). */
export const VISIT_MAX_AGE_MS = 60 * 60 * 1000;

/** La última salida al hábitat que no ha terminado, si la hay. */
export function ongoingVisitLog<T extends VisitLog>(history: T[], now = Date.now()): T | null {
  return (
    history
      .filter((h) => h.kind === 'habitat' && h.direction === 'out' && h.otherUserId && h.endedAt === null)
      .filter((h) => now - new Date(h.createdAt).getTime() < VISIT_MAX_AGE_MS)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null
  );
}

/** Amigo al que se está visitando según el historial: la última salida al hábitat que no ha terminado. */
export function ongoingVisitFrom(history: VisitLog[], now = Date.now()): string {
  return ongoingVisitLog(history, now)?.otherUserId ?? '';
}
