/**
 * Wishes Engine (spec 37 §4.5) — funciones puras.
 *
 * Hasta ahora el Pockai nunca quería nada por sí mismo. Un deseo es algo que le apetece según
 * cómo es, cómo está y lo que lleva sin hacer: explorar, ver a un amigo, enseñar lo que encontró,
 * unos mimos tras una ausencia larga, aprender un truco.
 *
 * - Con su entrenador, el deseo principal entra en el prompt como tema **opcional** y no en todos
 *   los turnos (cadencia en `balance.json`).
 * - En la vida autónoma multiplica el peso de la actividad que lo satisface.
 * - Cumplido, da algo de felicidad y un recuerdo, y no vuelve hasta que pasa su enfriamiento.
 *   Ignorado, caduca solo y sin castigo.
 */
import { Dims } from './mind.types';
import { Lang, text } from './strings';
import { weighted } from './personality.engine';

export const WISH_IDS = ['go_explore', 'see_friend', 'show_find', 'be_cuddled', 'learn_trick'] as const;
export type WishId = (typeof WISH_IDS)[number];

export interface WishConfig {
  base: number;
  weights?: Partial<Dims>;
  /** Días mínimos sin aventura (`go_explore`) o sin ver a un amigo (`see_friend`). */
  minDays?: number;
  /** Minutos mínimos sin su entrenador (`be_cuddled`). */
  minAwayMinutes?: number;
  /** Actividad autónoma que lo satisface, y cuánto la favorece mientras está activo. */
  activity?: string;
  activityBoost?: number;
}

export interface WishesConfig {
  /** Deseos activos a la vez. */
  maxActive: number;
  /** Puntuación mínima para que algo llegue a ser un deseo. */
  minScore: number;
  /** Como mucho, un deseo cada tantos turnos de chat. */
  showEveryTurns: number;
  /** Horas que un deseo cumplido tarda en poder volver. */
  cooldownHours: number;
  /** Felicidad al cumplirlo (dentro de los topes del juego). */
  happinessOnFulfil: number;
  catalog: Record<WishId, WishConfig>;
}

/** Lo que se guarda en `Pet.personality.wishes`. */
export interface WishesState {
  /** Turnos de chat que lleva la mascota (sirve de reloj para la cadencia). */
  turn: number;
  /** Turno en el que sacó un deseo por última vez. */
  shownTurn?: number;
  /** Último deseo que sacó, para reconocerlo si se cumple. */
  shownId?: string;
  /** Hasta cuándo no puede volver cada deseo (fecha ISO). */
  cooldownUntil: Record<string, string>;
}

/** Lo que el motor necesita saber para decidir qué le apetece. */
export interface WishContext {
  dims: Dims;
  now: Date;
  /** Minutos desde la última interacción de su entrenador. */
  awayMinutes: number;
  /** Días desde su última aventura; `null` si nunca ha ido. */
  daysSinceAdventure: number | null;
  /** Días desde que vio a un amigo; `null` si no tiene amigos (entonces no puede echarlos de menos). */
  daysSinceFriend: number | null;
  /** Tiene un objeto encontrado del que aún no ha hablado. */
  hasUntoldFind: boolean;
  /** Le queda algún truco por aprender. */
  canLearnTrick: boolean;
  energy: number;
  sick: boolean;
}

export function normalizeWishes(raw: unknown): WishesState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : undefined);
  const cooldownUntil: Record<string, string> = {};
  if (r.cooldownUntil && typeof r.cooldownUntil === 'object') {
    for (const [id, until] of Object.entries(r.cooldownUntil as Record<string, unknown>)) {
      if ((WISH_IDS as readonly string[]).includes(id) && typeof until === 'string') cooldownUntil[id] = until;
    }
  }
  return {
    turn: num(r.turn) ?? 0,
    shownTurn: num(r.shownTurn),
    shownId: typeof r.shownId === 'string' ? r.shownId : undefined,
    cooldownUntil,
  };
}

function eligible(id: WishId, c: WishConfig, ctx: WishContext): boolean {
  switch (id) {
    case 'go_explore':
      // Sin energía o enferma no le apetece salir
      if (ctx.sick || ctx.energy < 30) return false;
      return ctx.daysSinceAdventure === null || ctx.daysSinceAdventure >= (c.minDays ?? 0);
    case 'see_friend':
      return ctx.daysSinceFriend !== null && ctx.daysSinceFriend >= (c.minDays ?? 0);
    case 'show_find':
      return ctx.hasUntoldFind;
    case 'be_cuddled':
      return ctx.awayMinutes >= (c.minAwayMinutes ?? 0);
    case 'learn_trick':
      return ctx.canLearnTrick && !ctx.sick;
  }
}

/**
 * Deseos activos, del que más le apetece al que menos. Función pura: dos personalidades opuestas
 * dan deseos distintos con las mismas necesidades.
 */
export function activeWishes(ctx: WishContext, state: WishesState, cfg: WishesConfig): WishId[] {
  const scored: { id: WishId; score: number }[] = [];
  for (const id of WISH_IDS) {
    const c = cfg.catalog[id];
    if (!c || !eligible(id, c, ctx)) continue;
    const until = state.cooldownUntil[id];
    if (until && new Date(until).getTime() > ctx.now.getTime()) continue;
    const score = weighted(c.base, c.weights ?? {}, ctx.dims, 0);
    if (score >= cfg.minScore) scored.push({ id, score });
  }
  // Orden estable: a igual puntuación, el orden del catálogo
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, cfg.maxActive)
    .map((s) => s.id);
}

/** ¿Toca sacar un deseo en este turno? Como mucho uno cada `showEveryTurns`. */
export function mayShowWish(state: WishesState, cfg: WishesConfig): boolean {
  if (state.shownTurn === undefined) return true;
  return state.turn - state.shownTurn >= cfg.showEveryTurns;
}

/** Avanza el reloj de turnos y, si se sacó un deseo, lo anota. */
export function afterChatTurn(state: WishesState, shown: WishId | null): WishesState {
  const turn = state.turn + 1;
  return shown ? { ...state, turn, shownTurn: turn, shownId: shown } : { ...state, turn };
}

/** Marca un deseo como cumplido: entra en enfriamiento. Devuelve `null` si no era un deseo conocido. */
export function fulfilWish(state: WishesState, id: string, now: Date, cfg: WishesConfig): WishesState | null {
  if (!(WISH_IDS as readonly string[]).includes(id)) return null;
  const until = new Date(now.getTime() + cfg.cooldownHours * 3_600_000).toISOString();
  return { ...state, cooldownUntil: { ...state.cooldownUntil, [id]: until }, shownId: state.shownId === id ? undefined : state.shownId };
}

/** Multiplicadores de peso para las actividades autónomas que satisfacen los deseos activos. */
export function activityBoosts(wishes: readonly WishId[], cfg: WishesConfig): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of wishes) {
    const c = cfg.catalog[id];
    if (c?.activity && c.activityBoost) out[c.activity] = Math.max(out[c.activity] ?? 1, c.activityBoost);
  }
  return out;
}


/** Tema opcional para el prompt del chat. Nunca una orden: el modelo decide si encaja. */
export function wishHint(id: WishId, lang?: Lang): string {
  return text('WISH_HINT', { hint: text(`WISH_${id.toUpperCase()}`, {}, { lang }) }, { lang });
}


/** Recuerdo al cumplirse un deseo, en primera persona. */
export function fulfilEpisode(id: WishId, lang?: Lang): string {
  return text(`WISH_DONE_${id.toUpperCase()}`, {}, { lang });
}

export function isWish(v: unknown): v is WishId {
  return typeof v === 'string' && (WISH_IDS as readonly string[]).includes(v);
}
