/**
 * Tricks Engine (spec 37 §4.6) — funciones puras.
 *
 * Un Pockai puede aprender unos pocos trucos (girar, saludar, hacerse el dormido, traer algo).
 * Cada uno pide un mínimo de personalidad y varias prácticas. Se practican solos en la vida
 * autónoma o cuando el entrenador enseña en el chat, esto último con tope diario.
 *
 * No son las «skills» de combate (`shared/game-data/skills.json`) ni las habilidades de
 * escritorio (`ai/desktop-skills.ts`): por eso se llaman trucos.
 */
import { DIMENSIONS, Dims } from './mind.types';

export interface TrickConfig {
  /** Nombre visible, en minúscula («girar sobre sí mismo»). */
  name: string;
  /** Prácticas necesarias para aprenderlo. */
  practices: number;
  /** Mínimos de personalidad para poder aprenderlo. */
  minDims?: Partial<Dims>;
}

export interface TricksConfig {
  /** Prácticas por enseñanza del entrenador que cuentan en un día. */
  teachDailyCap: number;
  catalog: Record<string, TrickConfig>;
}

/** Lo que se guarda en `Pet.personality.tricks`. */
export interface TricksState {
  known: string[];
  /** Truco en curso y prácticas acumuladas. */
  learning?: { id: string; done: number } | null;
  /** Día (AAAA-MM-DD) del contador de enseñanzas. */
  teachDay?: string;
  taughtToday?: number;
}

export type PracticeSource = 'teach' | 'self';

export interface PracticeResult {
  state: TricksState;
  /** La práctica contó (hay truco que aprender y no se superó el tope). */
  counted: boolean;
  /** Id del truco que se acaba de aprender con esta práctica, si lo hubo. */
  learned: string | null;
  /** Truco que se está practicando tras esta llamada. */
  learning: string | null;
}

/** Limpia lo guardado: puede venir vacío, de otra versión o con trucos que ya no existen. */
export function normalizeTricks(raw: unknown, cfg: TricksConfig): TricksState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const exists = (id: unknown): id is string => typeof id === 'string' && id in cfg.catalog;
  const known = Array.isArray(r.known) ? [...new Set(r.known.filter(exists))] : [];
  const l = r.learning as { id?: unknown; done?: unknown } | null | undefined;
  const learning =
    l && exists(l.id) && !known.includes(l.id) && typeof l.done === 'number' && Number.isFinite(l.done)
      ? { id: l.id, done: Math.max(0, Math.floor(l.done)) }
      : null;
  return {
    known,
    learning,
    teachDay: typeof r.teachDay === 'string' ? r.teachDay : undefined,
    taughtToday: typeof r.taughtToday === 'number' && Number.isFinite(r.taughtToday) ? Math.max(0, r.taughtToday) : 0,
  };
}

function canLearn(trick: TrickConfig, dims: Dims): boolean {
  for (const d of DIMENSIONS) {
    const min = trick.minDims?.[d];
    if (min !== undefined && dims[d] < min) return false;
  }
  return true;
}

/** Siguiente truco que puede aprender (por orden del catálogo), o `null` si ya los sabe o no llega. */
export function nextTrick(state: TricksState, dims: Dims, cfg: TricksConfig): string | null {
  for (const [id, trick] of Object.entries(cfg.catalog)) {
    if (!state.known.includes(id) && canLearn(trick, dims)) return id;
  }
  return null;
}

/**
 * Una práctica. Si no había truco en curso empieza el siguiente que pueda aprender. Las
 * enseñanzas del entrenador (`teach`) tienen tope diario: pasado el tope no cuentan, sin castigo.
 */
export function practiceTrick(raw: TricksState, dims: Dims, cfg: TricksConfig, today: string, source: PracticeSource): PracticeResult {
  const state: TricksState = { ...raw, known: [...raw.known], learning: raw.learning ? { ...raw.learning } : null };
  if (state.teachDay !== today) {
    state.teachDay = today;
    state.taughtToday = 0;
  }
  if (!state.learning) {
    const id = nextTrick(state, dims, cfg);
    if (!id) return { state, counted: false, learned: null, learning: null };
    state.learning = { id, done: 0 };
  }
  if (source === 'teach') {
    if ((state.taughtToday ?? 0) >= cfg.teachDailyCap) return { state, counted: false, learned: null, learning: state.learning.id };
    state.taughtToday = (state.taughtToday ?? 0) + 1;
  }
  state.learning.done += 1;
  const id = state.learning.id;
  if (state.learning.done >= cfg.catalog[id].practices) {
    state.known.push(id);
    state.learning = null;
    return { state, counted: true, learned: id, learning: null };
  }
  return { state, counted: true, learned: null, learning: id };
}

/** Truco que haría ahora: uno de los que sabe, elegido de forma estable con `r` en [0, 1). */
export function trickToPerform(state: TricksState, r: number): string | null {
  if (!state.known.length) return null;
  return state.known[Math.min(state.known.length - 1, Math.floor(r * state.known.length))];
}
