import { APP_CATEGORIES, type AppCategory } from './client-context';

/**
 * Memoria contextual: hábitos de escritorio (funciones puras).
 *
 * El escritorio envía como mucho un resumen al día (digest) con minutos por categoría de app y
 * franja horaria, y las duraciones de sus Pomodoro. Aquí se fusiona en un perfil de TAMAÑO FIJO
 * con decaimiento exponencial (refleja hábitos recientes y nunca crece) y se derivan frases de
 * hábito deterministas, sin LLM ni tokens. Cada hábito tiene una clave estable y se reemplaza.
 */

/** Franjas de 4 h: 0-4, 4-8, 8-12, 12-16, 16-20, 20-24. */
export const SLOTS = 6;
const SLOT_LABEL = ['de madrugada', 'a primera hora de la mañana', 'por la mañana', 'a mediodía', 'por la tarde', 'por la noche'];

/** Categorías que cuentan para hábitos (la genérica no aporta nada). */
export const HABIT_CATEGORIES = APP_CATEGORIES.filter((c) => c !== 'generic') as Exclude<AppCategory, 'generic'>[];
type HabitCategory = (typeof HABIT_CATEGORIES)[number];

const CAT_LABEL: Record<HabitCategory, string> = {
  coding: 'programar',
  music: 'escuchar música',
  video: 'ver vídeos',
  gaming: 'jugar a videojuegos',
  reading: 'leer o navegar',
};

/** Tamaño máximo del digest en JSON (bytes aprox.). */
export const MAX_DIGEST_CHARS = 2048;
/** Un digest como mucho cada 12 h por mascota. */
export const DIGEST_MIN_INTERVAL_MS = 12 * 3600 * 1000;
/** Decaimiento por día transcurrido entre digests. */
export const DECAY_PER_DAY = 0.9;
const MAX_POMODOROS_PER_DIGEST = 30;
/** Cubetas de duración de Pomodoro (minutos de foco). */
const POMO_BUCKETS = [15, 25, 50, 90] as const;
/** Hábitos que se muestran en el prompt como mucho. */
export const MAX_HABITS_IN_PROMPT = 5;
/** Cota superior de claves de hábito por mascota (por construcción salen ≤ 7). */
export const MAX_HABIT_KEYS = 12;
export const MAX_HABIT_CHARS = 160;

export interface ContextDigest {
  /** Minutos por categoría y franja (6 números). Solo con context_awareness activa. */
  appMinutes?: Partial<Record<HabitCategory, number[]>>;
  /** Minutos de foco de cada Pomodoro completado. Solo con pomodoro_companion activa. */
  pomodoros?: number[];
}

export interface ContextProfile {
  v: 1;
  app: Record<HabitCategory, number[]>;
  pomo: Record<string, number>;
  /** Claves de hábito que el entrenador ha borrado: no se vuelven a generar. */
  muted: string[];
}

export type DigestResult = { ok: true; digest: ContextDigest } | { ok: false; error: string };

const finiteIn = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined;

/**
 * Valida el digest. Estricto con el tamaño y la forma; tolerante con categorías desconocidas
 * (se ignoran). `allow` indica qué partes permite el estado de las habilidades de la mascota.
 */
export function sanitizeDigest(raw: unknown, allow: { apps: boolean; pomodoro: boolean }): DigestResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'El resumen no es válido' };
  if (JSON.stringify(raw).length > MAX_DIGEST_CHARS) return { ok: false, error: 'El resumen es demasiado grande' };
  const r = raw as Record<string, any>;
  const out: ContextDigest = {};

  if (allow.apps && r.appMinutes && typeof r.appMinutes === 'object' && !Array.isArray(r.appMinutes)) {
    let total = 0;
    const apps: Partial<Record<HabitCategory, number[]>> = {};
    for (const cat of HABIT_CATEGORIES) {
      const row = r.appMinutes[cat];
      if (row === undefined) continue;
      if (!Array.isArray(row) || row.length !== SLOTS) return { ok: false, error: `appMinutes.${cat} debe tener ${SLOTS} franjas` };
      const nums = row.map((v: unknown) => finiteIn(v, 0, 240));
      if (nums.some((n) => n === undefined)) return { ok: false, error: `appMinutes.${cat} tiene valores fuera de rango` };
      apps[cat] = nums as number[];
      total += (nums as number[]).reduce((a, b) => a + b, 0);
    }
    // Un día tiene 1440 minutos: se admite margen por digests que cubren algo más de un día
    if (total > 2 * 1440) return { ok: false, error: 'Demasiados minutos en el resumen' };
    if (Object.keys(apps).length) out.appMinutes = apps;
  }

  if (allow.pomodoro && r.pomodoros !== undefined) {
    if (!Array.isArray(r.pomodoros) || r.pomodoros.length > MAX_POMODOROS_PER_DIGEST) {
      return { ok: false, error: `pomodoros debe ser una lista de como mucho ${MAX_POMODOROS_PER_DIGEST}` };
    }
    const mins = r.pomodoros.map((v: unknown) => finiteIn(v, 1, 180));
    if (mins.some((n: number | undefined) => n === undefined)) return { ok: false, error: 'pomodoros tiene valores fuera de rango' };
    if (mins.length) out.pomodoros = mins as number[];
  }

  return { ok: true, digest: out };
}

export function emptyProfile(): ContextProfile {
  const app = {} as Record<HabitCategory, number[]>;
  for (const c of HABIT_CATEGORIES) app[c] = Array(SLOTS).fill(0);
  const pomo: Record<string, number> = {};
  for (const b of POMO_BUCKETS) pomo[b] = 0;
  return { v: 1, app, pomo, muted: [] };
}

/** Lee el JSON guardado con tolerancia: cualquier dato raro se descarta y se rellena a cero. */
export function parseProfile(raw: unknown): ContextProfile {
  const p = emptyProfile();
  if (!raw || typeof raw !== 'object') return p;
  const r = raw as any;
  for (const c of HABIT_CATEGORIES) {
    const row = r.app?.[c];
    if (Array.isArray(row) && row.length === SLOTS) p.app[c] = row.map((v: unknown) => finiteIn(v, 0, 1e6) ?? 0);
  }
  for (const b of POMO_BUCKETS) p.pomo[b] = finiteIn(r.pomo?.[b], 0, 1e6) ?? 0;
  if (Array.isArray(r.muted)) p.muted = r.muted.filter((k: unknown) => typeof k === 'string' && k.startsWith('habit:')).slice(0, MAX_HABIT_KEYS);
  return p;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function bucketOf(minutes: number): number {
  let best: number = POMO_BUCKETS[0];
  for (const b of POMO_BUCKETS) if (Math.abs(b - minutes) < Math.abs(best - minutes)) best = b;
  return best;
}

/** Aplica el decaimiento por los días transcurridos y suma el digest. Tamaño constante. */
export function mergeDigest(profile: ContextProfile, digest: ContextDigest, daysSinceLast: number): ContextProfile {
  const k = Math.pow(DECAY_PER_DAY, Math.max(0, Math.min(daysSinceLast, 365)));
  const next = parseProfile(profile);
  for (const c of HABIT_CATEGORIES) {
    const add = digest.appMinutes?.[c];
    next.app[c] = next.app[c].map((v, i) => round1(v * k + (add?.[i] ?? 0)));
  }
  for (const b of POMO_BUCKETS) next.pomo[b] = round1(next.pomo[b] * k);
  for (const m of digest.pomodoros ?? []) next.pomo[bucketOf(m)] = round1(next.pomo[bucketOf(m)] + 1);
  return next;
}

export interface Habit {
  key: string;
  content: string;
}

/** Umbrales mínimos (minutos ya decaídos) para afirmar un hábito con algo de confianza. */
const MIN_CATEGORY_MINUTES = 120;
const MIN_TOTAL_MINUTES = 300;
const MIN_SLOT_SHARE = 0.45;
const MIN_MAIN_SHARE = 0.4;
const MIN_POMODOROS = 3;

/** Frases de hábito deterministas. Solo las que superan los umbrales y no están silenciadas. */
export function deriveHabits(profile: ContextProfile): Habit[] {
  const habits: Habit[] = [];
  const totals = HABIT_CATEGORIES.map((c) => ({ c, total: profile.app[c].reduce((a, b) => a + b, 0) }));
  const all = totals.reduce((a, t) => a + t.total, 0);

  for (const { c, total } of totals) {
    if (total < MIN_CATEGORY_MINUTES) continue;
    const row = profile.app[c];
    const peak = row.indexOf(Math.max(...row));
    const share = row[peak] / total;
    if (share >= MIN_SLOT_SHARE) {
      habits.push({
        key: `habit:${c}_time`,
        content: `Suele ${CAT_LABEL[c]} sobre todo ${SLOT_LABEL[peak]} (≈${Math.round(share * 100)} % de ese tiempo).`,
      });
    }
  }

  if (all >= MIN_TOTAL_MINUTES) {
    const top = totals.reduce((a, b) => (b.total > a.total ? b : a));
    const share = top.total / all;
    if (share >= MIN_MAIN_SHARE) {
      habits.push({
        key: 'habit:main_activity',
        content: `En el ordenador, lo que más hace es ${CAT_LABEL[top.c]} (≈${Math.round(share * 100)} % del tiempo con apps reconocidas).`,
      });
    }
  }

  const pomoTotal = POMO_BUCKETS.reduce((a, b) => a + profile.pomo[b], 0);
  if (pomoTotal >= MIN_POMODOROS) {
    const fav = POMO_BUCKETS.reduce((a, b) => (profile.pomo[b] > profile.pomo[a] ? b : a));
    habits.push({ key: 'habit:pomodoro_length', content: `Prefiere sesiones de foco Pomodoro de unos ${fav} minutos.` });
  }

  const muted = new Set(profile.muted);
  return habits
    .filter((h) => !muted.has(h.key))
    .slice(0, MAX_HABIT_KEYS)
    .map((h) => ({ key: h.key, content: h.content.slice(0, MAX_HABIT_CHARS) }));
}
