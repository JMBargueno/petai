/**
 * Menú del entrenador que visita (spec 37 §6.2): textos e iconos del cliente. Qué opciones hay y
 * qué contesta el Pockai lo decide el servidor (`backend/src/modules/mind/visitor.engine.ts`).
 */
import { writable } from 'svelte/store';

/** Lo que el Pockai anfitrión siente por quien le visita, en palabras. */
const STAGE: Record<string, string> = {
  stranger: 'Aún no te conoce',
  acquaintance: 'Ya te conoce',
  friend: 'Te tiene cariño',
  best_friend: 'Te adora',
};

export function visitorStageLabel(stage: string | null | undefined): string {
  return (stage && STAGE[stage]) || '';
}

const ICON: Record<string, string> = {
  greet: 'smile',
  pet: 'heart',
  treat: 'food',
  play: 'play',
  ask: 'chat',
  wait: 'clock',
  bye: 'logout',
};

/** Icono de una opción; una opción que este cliente no conoce se muestra igual, con uno genérico. */
export function optionIcon(id: string): string {
  return ICON[id] ?? 'chat';
}

/** Lo que el dueño recibe cuando un visitante hace algo con su Pockai (`habitat:visitor_interaction`). */
export interface VisitorInteractionEvent {
  visitorId: string;
  petId: string;
  option: string;
  line: string;
  behavior?: { action: string; animation: string; emote: string | null };
}

/** Última interacción de un visitante con tu Pockai. `n` crece con cada una. */
export const visitorTalk = writable<(VisitorInteractionEvent & { n: number }) | null>(null);

let count = 0;
export function visitorInteracted(ev: VisitorInteractionEvent | null | undefined) {
  if (!ev?.visitorId || typeof ev.line !== 'string' || !ev.line) return;
  visitorTalk.set({ ...ev, line: ev.line.slice(0, 300), n: ++count });
}

/** Al irse el visitante, lo que hizo deja de mostrarse. */
export function clearVisitorTalk(visitorId?: string) {
  visitorTalk.update((t) => (!t || !visitorId || t.visitorId === visitorId ? null : t));
}
