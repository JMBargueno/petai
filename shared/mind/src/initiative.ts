/**
 * Iniciativa: cuándo y qué dice el Pockai por su cuenta, sin que nadie le hable.
 *
 * - **Cuánto puede interrumpir** lo elige su entrenador entre tres niveles (`quiet`: solo al
 *   volver; `normal`: discreto; `chatty`: hablador). Sobre ese nivel, **su carácter** lo acerca o
 *   lo aleja: un Pockai sociable e inquieto habla más a menudo que uno reservado y tranquilo.
 * - **Qué dice** sale por prioridad: primero la bienvenida si su entrenador acaba de volver,
 *   después lo que necesita, después lo que le apetece o siente, y por último charla sin más.
 *
 * Funciones puras: el reloj y el azar llegan de fuera. El servidor las usa para decidir por las
 * apps; quien las llame solo tiene que mostrar el resultado.
 */
import type { Dims } from './dims';
import { pickPhrase, type PhraseContext, type PhraseEntry, type PickedPhrase } from './phrases';

export const TALK_LEVELS = ['quiet', 'normal', 'chatty'] as const;
export type TalkLevel = (typeof TALK_LEVELS)[number];

export const CHANNELS = ['desktop', 'mobile'] as const;
export type Channel = (typeof CHANNELS)[number];

export function isTalkLevel(v: unknown): v is TalkLevel {
  return typeof v === 'string' && (TALK_LEVELS as readonly string[]).includes(v);
}

export function isChannel(v: unknown): v is Channel {
  return typeof v === 'string' && (CHANNELS as readonly string[]).includes(v);
}

export interface TalkLevelConfig {
  /** Escritorio: minutos mínimos entre dos frases suyas (con un carácter neutro). */
  desktopMinutes: number;
  /** Móvil: frases suyas como mucho al día. */
  mobilePerDay: number;
  /** Solo habla cuando su entrenador acaba de volver. */
  onlyOnReturn?: boolean;
}

export interface InitiativeConfig {
  defaultLevel: TalkLevel;
  levels: Record<TalkLevel, TalkLevelConfig>;
  /** Cómo el carácter cambia la frecuencia: base 1 más peso por punto de dimensión sobre 50. */
  personality: { weights: Partial<Dims>; min: number; max: number };
  /** Horas (locales, 0-23) en las que no habla por su cuenta. `from` puede ser mayor que `to`. */
  quietHours: { from: number; to: number };
  /** Minutos sin su entrenador a partir de los cuales cuenta como «ha vuelto». */
  backAfterMinutes: number;
  /** Tipos de frase, por orden de prioridad. Cada grupo se intenta entero antes del siguiente. */
  priority: string[][];
  /** Frases recientes que se recuerdan para no repetirse. */
  recentWindow: number;
}

/** Lo que se guarda de la iniciativa de una mascota (en su JSON de personalidad). */
export interface InitiativeState {
  level?: TalkLevel;
  /** Momento (ms) de la última frase suya, por canal. */
  lastSpokenAt?: Partial<Record<Channel, number>>;
  /** Momento (ms) de la última vez que se dijo cada frase. */
  lastAt?: Record<string, number>;
  recent?: string[];
  /** Momento (ms) del último saludo de vuelta: uno por ausencia, no uno cada vez que se pregunta. */
  lastReturnAt?: number;
  /** Día local (`AAAA-MM-DD`) y cuántas frases lleva por el móvil ese día. */
  day?: string;
  mobileCount?: number;
}

/** Deja el estado guardado en una forma segura (puede venir de otra versión o estar corrupto). */
export function normalizeInitiative(raw: unknown): InitiativeState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const spoken = (r.lastSpokenAt && typeof r.lastSpokenAt === 'object' ? r.lastSpokenAt : {}) as Record<string, unknown>;
  const lastAt: Record<string, number> = {};
  if (r.lastAt && typeof r.lastAt === 'object') {
    for (const [id, at] of Object.entries(r.lastAt as Record<string, unknown>)) {
      const n = num(at);
      if (n !== undefined && /^[a-z][a-z0-9_]*$/.test(id)) lastAt[id] = n;
    }
  }
  return {
    ...(isTalkLevel(r.level) ? { level: r.level } : {}),
    lastSpokenAt: { ...(num(spoken.desktop) !== undefined ? { desktop: num(spoken.desktop) } : {}), ...(num(spoken.mobile) !== undefined ? { mobile: num(spoken.mobile) } : {}) },
    lastAt,
    recent: Array.isArray(r.recent) ? r.recent.filter((x): x is string => typeof x === 'string').slice(-24) : [],
    ...(num(r.lastReturnAt) !== undefined ? { lastReturnAt: num(r.lastReturnAt) } : {}),
    ...(typeof r.day === 'string' ? { day: r.day } : {}),
    mobileCount: num(r.mobileCount) ?? 0,
  };
}

/**
 * ¿Toca saludar por la vuelta? El cliente dice que su entrenador ha vuelto (`claimed`); aquí se
 * comprueba que no se le haya saludado ya en esta ausencia.
 */
export function shouldGreetReturn(claimed: boolean, state: InitiativeState, now: number, cfg: Pick<InitiativeConfig, 'backAfterMinutes'>): boolean {
  if (!claimed) return false;
  const last = state.lastReturnAt;
  return last === undefined || now - last >= cfg.backAfterMinutes * 60_000;
}

/**
 * Cuánto de hablador es por carácter: 1 es lo normal; por encima habla más a menudo. Acotado para
 * que ni el más extrovertido agobie ni el más reservado enmudezca.
 */
export function talkFactor(dims: Dims, cfg: Pick<InitiativeConfig, 'personality'>): number {
  let f = 1;
  for (const [dim, w] of Object.entries(cfg.personality.weights)) f += (w ?? 0) * ((dims[dim as keyof Dims] ?? 50) - 50);
  return Math.round(Math.min(cfg.personality.max, Math.max(cfg.personality.min, f)) * 1000) / 1000;
}

/** Tiempo mínimo entre dos frases suyas en el escritorio, ya ajustado a su carácter. */
export function desktopGapMs(level: TalkLevel, dims: Dims, cfg: InitiativeConfig): number {
  return Math.round((cfg.levels[level].desktopMinutes * 60_000) / talkFactor(dims, cfg));
}

/** Frases al día por el móvil, ya ajustadas a su carácter (al menos una si el nivel lo permite). */
export function mobileDailyCap(level: TalkLevel, dims: Dims, cfg: InitiativeConfig): number {
  const base = cfg.levels[level].mobilePerDay;
  return base <= 0 ? 0 : Math.max(1, Math.round(base * talkFactor(dims, cfg)));
}

export function inQuietHours(localHour: number, quiet: { from: number; to: number }): boolean {
  if (quiet.from === quiet.to) return false;
  return quiet.from < quiet.to ? localHour >= quiet.from && localHour < quiet.to : localHour >= quiet.from || localHour < quiet.to;
}

export type SilenceReason = 'asleep' | 'focus' | 'quiet_hours' | 'only_on_return' | 'too_soon' | 'daily_cap' | 'nothing_to_say';

export interface InitiativeInput {
  channel: Channel;
  level: TalkLevel;
  dims: Dims;
  state: InitiativeState;
  now: number;
  /** Hora local del entrenador (0-23) y su día local (`AAAA-MM-DD`). */
  localHour: number;
  localDay: string;
  /** Su entrenador acaba de volver tras una ausencia. */
  back: boolean;
  /** La mascota duerme. */
  asleep: boolean;
  /** El entrenador está concentrado (Pomodoro, pantalla completa): no se le interrumpe. */
  focus: boolean;
}

/**
 * ¿Puede hablar ahora? Devuelve el motivo si no. Volver tras una ausencia salta la espera entre
 * frases (es el momento de saludar), pero no el sueño, la concentración ni las horas de silencio.
 */
export function maySpeak(input: InitiativeInput, cfg: InitiativeConfig): { ok: true } | { ok: false; reason: SilenceReason; retryInMs: number } {
  const { channel, level, dims, state, now } = input;
  const levelCfg = cfg.levels[level];
  const gap = desktopGapMs(level, dims, cfg);
  const no = (reason: SilenceReason, retryInMs: number) => ({ ok: false as const, reason, retryInMs: Math.max(60_000, Math.round(retryInMs)) });
  if (input.asleep) return no('asleep', 15 * 60_000);
  if (input.focus) return no('focus', 5 * 60_000);
  if (inQuietHours(input.localHour, cfg.quietHours)) return no('quiet_hours', 30 * 60_000);
  if (levelCfg.onlyOnReturn && !input.back) return no('only_on_return', 10 * 60_000);

  if (channel === 'mobile') {
    const count = state.day === input.localDay ? (state.mobileCount ?? 0) : 0;
    if (count >= mobileDailyCap(level, dims, cfg)) return no('daily_cap', 3 * 3_600_000);
  }
  const last = state.lastSpokenAt?.[channel];
  if (last !== undefined && !input.back && now - last < gap) return no('too_soon', gap - (now - last));
  // Aunque acabe de volver, no dos saludos seguidos
  if (last !== undefined && input.back && now - last < Math.min(gap, 5 * 60_000)) return no('too_soon', 5 * 60_000 - (now - last));
  return { ok: true };
}

export interface InitiativeResult {
  phrase: PickedPhrase | null;
  /** Por qué calla, si calla. */
  reason?: SilenceReason;
  /** Cuándo tiene sentido volver a preguntar. */
  retryInMs: number;
  /** Estado a guardar (solo cambia si ha hablado). */
  state: InitiativeState;
}

/**
 * Decide si habla y qué dice. `ctx` trae las variables conocidas y las señales de contexto; los
 * enfriamientos por frase y el historial se toman del estado guardado.
 */
export function takeInitiative(
  phrases: readonly PhraseEntry[],
  input: InitiativeInput,
  ctx: Omit<PhraseContext, 'recent' | 'lastAt' | 'now' | 'dims'>,
  cfg: InitiativeConfig,
): InitiativeResult {
  const state = normalizeInitiative(input.state);
  const allowed = maySpeak({ ...input, state }, cfg);
  // Comparación explícita: el backend compila esta librería sin `strictNullChecks` y ahí `!allowed.ok` no acota el tipo
  if (allowed.ok === false) return { phrase: null, reason: allowed.reason, retryInMs: allowed.retryInMs, state };

  const levelCfg = cfg.levels[input.level];
  const full: PhraseContext = { ...ctx, dims: input.dims, recent: state.recent ?? [], lastAt: state.lastAt ?? {}, now: input.now };
  let picked: PickedPhrase | null = null;
  for (const group of cfg.priority) {
    // En el nivel más callado solo existe la bienvenida
    const kinds = levelCfg.onlyOnReturn ? group.filter((k) => k === 'return') : group;
    // La bienvenida solo tiene sentido si acaba de volver
    const usable = input.back ? kinds : kinds.filter((k) => k !== 'return');
    if (!usable.length) continue;
    picked = pickPhrase(phrases, full, usable);
    if (picked) break;
  }
  const gap = desktopGapMs(input.level, input.dims, cfg);
  if (!picked) return { phrase: null, reason: 'nothing_to_say', retryInMs: Math.max(60_000, Math.round(gap / 2)), state };

  const sameDay = state.day === input.localDay;
  const next: InitiativeState = {
    ...state,
    lastSpokenAt: { ...state.lastSpokenAt, [input.channel]: input.now },
    lastAt: { ...state.lastAt, [picked.id]: input.now },
    recent: [...(state.recent ?? []), picked.id].slice(-cfg.recentWindow),
    ...(picked.kind === 'return' ? { lastReturnAt: input.now } : {}),
    day: input.localDay,
    mobileCount: (sameDay ? (state.mobileCount ?? 0) : 0) + (input.channel === 'mobile' ? 1 : 0),
  };
  return { phrase: picked, retryInMs: gap, state: next };
}
