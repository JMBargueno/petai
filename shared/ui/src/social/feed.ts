/**
 * Feed social: los eventos de tiempo real que alimentan el estado de pantalla de lo social
 * (quién visita tu hábitat, el chat y los objetivos del clan). No sabe de dónde vienen: cada app
 * le pasa cómo suscribirse. El escritorio, su socket (que en el modo demo es el del navegador);
 * Android, `onRealtime` de `@pockai/client`, que reenvía lo que recibe el núcleo.
 *
 * Solo escribe en los stores. Lo que cada app haga además con el mismo evento (la reacción de la
 * mascota, un aviso del sistema) lo engancha ella aparte.
 */
import type { ClanGoal, ClanMessage, ClanXpEvent, HabitatSceneEvent, HabitatVisitor } from './types';
import { sceneReceived, visitorJoined, visitorLeft } from './visitors';
import { clearVisitorTalk, visitorInteracted, type VisitorInteractionEvent } from './visitDialog';
import { bumpClanRoster, dropClanMessage, emitClanHabitatEvent, pushClanMessage, upsertClanGoal } from './clans';

/** Cómo suscribirse a un evento; puede devolver cómo dejar de escucharlo. */
export type SocialEventSource = (event: string, handler: (payload: any) => void) => (() => void) | void;

/** Nombres de los eventos que atiende el feed (para quien necesite filtrarlos). */
export const SOCIAL_EVENTS = [
  'habitat:visitor_joined',
  'habitat:visitor_left',
  'habitat:scene',
  'habitat:visitor_interaction',
  'clan:message',
  'clan:goal_progress',
  'clan:goal_completed',
  'clan:message_deleted',
  'clan:xp',
  'clan:role_changed',
  'clan:member_kicked',
  'clan:disbanded',
] as const;

/** Empieza a reflejar los eventos sociales en los stores. Devuelve cómo pararlo. */
export function connectSocialFeed(on: SocialEventSource): () => void {
  const stops: (() => void)[] = [];
  const listen = (event: (typeof SOCIAL_EVENTS)[number], handler: (payload: any) => void) => {
    const stop = on(event, handler);
    if (typeof stop === 'function') stops.push(stop);
  };

  // Amigos de visita en tu hábitat (feature 021)
  listen('habitat:visitor_joined', (v: HabitatVisitor | null) => {
    if (v?.visitorId) visitorJoined(v);
  });
  listen('habitat:visitor_left', (ev: { visitorId?: string } | null) => {
    if (ev?.visitorId) {
      visitorLeft(ev.visitorId);
      clearVisitorTalk(ev.visitorId);
    }
  });
  // Lo que el visitante hace con tu Pockai (saludarle, traerle un premio…) y lo que contesta
  listen('habitat:visitor_interaction', (ev: VisitorInteractionEvent | null) => visitorInteracted(ev));
  // Qué hacen tu Pockai y el visitante: lo decide el servidor y se representa en la sala
  listen('habitat:scene', (ev: HabitatSceneEvent | null) => sceneReceived(ev));

  // Chat y objetivos de clan
  listen('clan:message', (m: ClanMessage | null) => {
    if (m?.id && m?.clanId) pushClanMessage(m);
  });
  listen('clan:goal_progress', (g: ClanGoal | null) => {
    if (g?.id && g?.clanId) upsertClanGoal(g);
  });
  listen('clan:goal_completed', (g: ClanGoal | null) => {
    if (!g?.id || !g?.clanId) return;
    upsertClanGoal(g);
    emitClanHabitatEvent({ kind: 'goal', clanId: g.clanId, title: g.title });
  });
  // Rangos del Nexo: borrados en el chat y cambios de roster (la pestaña recarga el clan)
  listen('clan:message_deleted', (ev: { id?: string } | null) => {
    if (ev?.id) dropClanMessage(ev.id);
  });
  // Hábitat del Nexo: la XP del clan sube (y a veces el escenario cambia de nivel)
  listen('clan:xp', (ev: ClanXpEvent | null) => {
    if (ev?.clanId && typeof ev.xp === 'number') emitClanHabitatEvent({ kind: 'xp', ...ev });
  });
  listen('clan:role_changed', () => bumpClanRoster());
  listen('clan:member_kicked', () => bumpClanRoster());
  listen('clan:disbanded', () => bumpClanRoster());

  return () => {
    for (const stop of stops.splice(0)) stop();
  };
}
