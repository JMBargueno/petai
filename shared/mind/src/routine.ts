/**
 * Rutinas con continuidad (spec 41, fase F).
 *
 * La vida autónoma decide qué hace el Pockai cada hora que su entrenador no está. Sin esto, cada
 * hora era una tirada suelta: podía explorar a las cuatro de la madrugada y cambiar de actividad
 * cada hora sin ton ni son. Aquí se añaden dos cosas, las dos como multiplicadores del peso de
 * cada actividad (la personalidad sigue mandando):
 *
 * - **El momento del día**, en la hora local de su entrenador: de noche descansa, por la mañana
 *   explora, al caer la tarde espera a que vuelva.
 * - **El hilo**: lo que está haciendo tiende a seguir un rato (una tarde explorando), hasta que
 *   se cansa de ello; y al terminar, hay cosas que apetecen más (descansar después de explorar).
 *
 * Funciones puras: sin reloj ni azar. Los números están en
 * `balance.json → personality.autonomy.routine`.
 */

export const DAY_PHASES = ['morning', 'afternoon', 'evening', 'night'] as const;
export type DayPhase = (typeof DAY_PHASES)[number];

export interface RoutineConfig {
  /** Hora local (0-23) a la que empieza cada momento del día; en orden creciente. */
  phaseStarts: Record<DayPhase, number>;
  /** Momento → actividad → multiplicador (lo que no esté, 1). */
  phaseFactors: Record<DayPhase, Record<string, number>>;
  momentum: {
    /** Seguir con lo mismo pesa esto más… */
    stay: number;
    /** …hasta llevar estas horas seguidas; entonces pesa `tired`. */
    maxStreak: number;
    tired: number;
    /** Actividades de las que no se cansa (descansar no aburre). */
    noFatigue: string[];
  };
  /** Al dejar una actividad, cuáles apetecen más: anterior → siguiente → multiplicador. */
  after: Record<string, Record<string, number>>;
  /** Horas seguidas a partir de las cuales lo cuenta como «me pasé un buen rato…». */
  longFrom: number;
}

export interface RoutineState {
  last: string | null;
  /** Horas seguidas con `last`. */
  streak: number;
  /** Índice del último intervalo simulado: el hilo solo vale para el siguiente. */
  index: number | null;
}

export function emptyRoutine(): RoutineState {
  return { last: null, streak: 0, index: null };
}

/** Lee lo guardado con desconfianza. */
export function normalizeRoutine(raw: unknown): RoutineState {
  const r = (raw ?? {}) as Partial<RoutineState>;
  if (typeof r.last !== 'string' || !Number.isInteger(r.index) || !(typeof r.streak === 'number' && r.streak >= 1)) return emptyRoutine();
  return { last: r.last, streak: Math.floor(r.streak), index: r.index as number };
}

/** Momento del día de una hora local. Antes del primer comienzo es todavía el último (la noche). */
export function phaseOf(hour: number, cfg: RoutineConfig): DayPhase {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const ordered = [...DAY_PHASES].sort((a, b) => cfg.phaseStarts[a] - cfg.phaseStarts[b]);
  let phase = ordered[ordered.length - 1];
  for (const p of ordered) if (h >= cfg.phaseStarts[p]) phase = p;
  return phase;
}

/** ¿Viene el intervalo `index` justo detrás del último simulado? Solo entonces hay hilo. */
export function isContinuing(state: RoutineState, index: number): boolean {
  return state.last !== null && state.index === index - 1;
}

/** Multiplicador del peso de una actividad en este intervalo. Siempre mayor que 0. */
export function routineFactor(activity: string, phase: DayPhase, state: RoutineState, index: number, cfg: RoutineConfig): number {
  let f = cfg.phaseFactors[phase]?.[activity] ?? 1;
  if (isContinuing(state, index)) {
    if (state.last === activity) {
      const tired = state.streak >= cfg.momentum.maxStreak && !cfg.momentum.noFatigue.includes(activity);
      f *= tired ? cfg.momentum.tired : cfg.momentum.stay;
    } else {
      f *= cfg.after[state.last as string]?.[activity] ?? 1;
    }
  }
  return Math.max(0.001, f);
}

/** El hilo tras hacer `activity` en el intervalo `index`. */
export function advanceRoutine(state: RoutineState, activity: string, index: number): RoutineState {
  const same = isContinuing(state, index) && state.last === activity;
  return { last: activity, streak: same ? state.streak + 1 : 1, index };
}

/** ¿Es este el momento de contarlo como un buen rato seguido? Una vez por racha. */
export function isLongStretch(state: RoutineState, cfg: RoutineConfig): boolean {
  return state.streak === cfg.longFrom;
}
