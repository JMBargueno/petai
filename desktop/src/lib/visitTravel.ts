import { get, writable } from 'svelte/store';
import { activeVisit, ongoingVisitLog, type VisitLog } from './activeVisit';

/**
 * Viaje de tu Pockai por las hebras del Nexo cuando va de visita (LORE §8).
 *
 *   home ──startTravel──▶ departing ──travelArrived──▶ away ──endTravel──▶ returning ──travelArrived──▶ home
 *
 * `departing` y `returning` solo existen mientras hay una mascota en pantalla que pinte el portal
 * (un «presentador», PetView): si no la hay (está en su hábitat, o la app arrancó con la visita en
 * curso) se salta directamente al estado final, sin animación.
 *
 * El servidor cierra solo las visitas de más de 15 min y no avisa al visitante, así que aquí hay un
 * temporizador que hace volver al Pockai a su hora (`configureTravel({ onExpire })`).
 */
export type TravelState = 'home' | 'departing' | 'away' | 'returning';

export interface TravelInfo {
  state: TravelState;
  /** Nombre del amigo visitado (para lo que dice al volver). */
  friendName: string;
  startedAt: number | null;
}

/** Igual que `VISIT_MAX_AGE_MS` del backend (habitat-visit.service.ts). */
export const VISIT_LIVE_MS = 15 * 60 * 1000;

const HOME: TravelInfo = { state: 'home', friendName: '', startedAt: null };

export const travel = writable<TravelInfo>(HOME);

let presenters = 0;
let returnQueued = false;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
let onExpire: () => void = () => endTravel();

export function configureTravel(opts: { onExpire?: () => void }): void {
  if (opts.onExpire) onExpire = opts.onExpire;
}

function scheduleExpiry(startedAt: number, now: number) {
  clearExpiry();
  const left = Math.max(0, startedAt + VISIT_LIVE_MS - now);
  expiryTimer = setTimeout(() => {
    expiryTimer = null;
    if (get(travel).state !== 'home') onExpire();
  }, left);
}

function clearExpiry() {
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
}

/** El Pockai se va de visita (tras confirmarlo el servidor). */
export function startTravel(friendName: string, now = Date.now()): void {
  const cur = get(travel).state;
  if (cur === 'away' || cur === 'departing') return;
  returnQueued = false;
  travel.set({ state: presenters > 0 ? 'departing' : 'away', friendName, startedAt: now });
  scheduleExpiry(now, now);
}

/** Visita que ya estaba en curso (al arrancar la app): fuera, sin animación. */
export function restoreAway(friendName: string, startedAt: number, now = Date.now()): void {
  if (get(travel).state !== 'home') return;
  if (now - startedAt >= VISIT_LIVE_MS) return;
  travel.set({ state: 'away', friendName, startedAt });
  scheduleExpiry(startedAt, now);
}

/** Recupera la visita en curso del historial: marca `activeVisit` y deja al Pockai fuera. */
export function restoreFromHistory(history: VisitLog[], now = Date.now()): void {
  const log = ongoingVisitLog(history, now);
  if (!log?.otherUserId) return;
  if (!get(activeVisit)) activeVisit.set(log.otherUserId);
  restoreAway(log.otherName ?? '', new Date(log.createdAt).getTime(), now);
}

/** Termina la visita: vuelve por el portal (o directamente, si no hay mascota en pantalla). */
export function endTravel(): void {
  clearExpiry();
  const cur = get(travel);
  if (cur.state === 'home' || cur.state === 'returning') return;
  if (cur.state === 'departing') {
    // Aún está entrando: en cuanto acabe, da media vuelta.
    returnQueued = true;
    return;
  }
  travel.set({ ...cur, state: presenters > 0 ? 'returning' : 'home' });
}

/** El presentador avisa de que la animación en curso ha terminado. */
export function travelArrived(): void {
  const cur = get(travel);
  if (cur.state === 'departing') {
    travel.set({ ...cur, state: 'away' });
    if (returnQueued) {
      returnQueued = false;
      endTravel();
    }
  } else if (cur.state === 'returning') {
    travel.set(HOME);
  }
}

/**
 * Una mascota en pantalla se ofrece a pintar los viajes. Devuelve la baja: si se desmonta a mitad
 * de una animación, el viaje se da por terminado para no quedarse colgado.
 */
export function registerTravelPresenter(): () => void {
  presenters++;
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    presenters = Math.max(0, presenters - 1);
    const cur = get(travel).state;
    if (presenters === 0 && (cur === 'departing' || cur === 'returning')) travelArrived();
  };
}

/** Vuelve al estado inicial sin animación (al cerrar sesión y en los tests). */
/** `presenters: true` (solo tests) olvida además las mascotas registradas y el aviso de caducidad. */
export function resetTravel(opts: { presenters?: boolean } = {}): void {
  clearExpiry();
  if (opts.presenters) presenters = 0;
  returnQueued = false;
  if (opts.presenters) onExpire = () => endTravel();
  travel.set(HOME);
}
