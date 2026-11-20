/**
 * Visitas (feature 021): constantes y lógica pura que comparten las apps. La visita en curso como
 * estado vivo (y el viaje por el portal) es de cada app; aquí solo se deduce del historial.
 */

/** Largo máximo del mensaje que lleva tu Pockai a la visita. */
export const VISIT_MESSAGE_MAX = 140;
/** Energía que gasta visitar un hábitat. */
export const VISIT_ENERGY_COST = 10;

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

/** Fecha corta y relativa para el historial («hace 5 min»). */
export function visitWhen(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  const diff = Math.round((now - d.getTime()) / 60000);
  if (diff < 1) return 'ahora';
  if (diff < 60) return `hace ${diff} min`;
  if (diff < 60 * 24) return `hace ${Math.round(diff / 60)} h`;
  if (diff < 60 * 24 * 7) return `hace ${Math.round(diff / 1440)} d`;
  return d.toLocaleDateString();
}
