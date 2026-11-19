/**
 * Aprendizaje por refuerzo, pequeño y acotado (spec 41, fase D).
 *
 * El Pockai aprende qué conductas le gustan a su entrenador: si le acaricia justo cuando baila,
 * bailará algo más a menudo; si lo aparta cada vez que trepa, trepará algo menos. No cambia quién
 * es (eso son las cinco dimensiones): solo inclina un poco la balanza entre conductas.
 *
 * Garantías, todas en datos (`balance.json → personality.learning`):
 * - Cada preferencia vive en [-1, 1] y se traduce en un multiplicador entre `factor.min` y
 *   `factor.max`: por mucho que se premie algo, nunca acapara, y nada desaparece del todo.
 * - Lo aprendido se va olvidando (vida media), así que un cambio de gustos se corrige solo.
 * - Hay un tope de señales al día: dejar el ratón encima no lo adiestra.
 *
 * Funciones puras: sin reloj ni azar propios.
 */

export interface LearningConfig {
  /** Cuánto se acerca la preferencia a su extremo con una señal de fuerza 1 (0-1). */
  rate: number;
  /** Una señal cuenta para la conducta en curso o la que acabó hace menos de esto. */
  creditWindowMs: number;
  halfLifeDays: number;
  factor: { min: number; max: number };
  maxEntries: number;
  dailyCap: number;
  /** Gestos del entrenador y su fuerza, de -1 (no le gusta) a 1 (le encanta). */
  signals: Record<string, number>;
}

export interface Learned {
  prefs: Record<string, number>;
  /** Cuándo se asentó por última vez (ms). */
  at: number;
  day: string | null;
  /** Señales contadas en `day`. */
  count: number;
}

const DAY_MS = 86_400_000;
/** Por debajo de esto una preferencia se da por olvidada. */
const FORGOTTEN = 0.02;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number) => Math.round(v * 1000) / 1000;
const dayOf = (now: number) => new Date(now).toISOString().slice(0, 10);

export function emptyLearned(now = 0): Learned {
  return { prefs: {}, at: now, day: null, count: 0 };
}

/** Lee lo guardado con desconfianza: descarta lo que no sea un número válido o una conducta conocida. */
export function normalizeLearned(raw: unknown, known?: readonly string[]): Learned {
  const r = (raw ?? {}) as Partial<Learned>;
  const prefs: Record<string, number> = {};
  if (r.prefs && typeof r.prefs === 'object') {
    for (const [id, v] of Object.entries(r.prefs)) {
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      if (known && !known.includes(id)) continue;
      prefs[id] = round(clamp(v, -1, 1));
    }
  }
  return {
    prefs,
    at: typeof r.at === 'number' && Number.isFinite(r.at) ? r.at : 0,
    day: typeof r.day === 'string' ? r.day : null,
    count: typeof r.count === 'number' && r.count > 0 ? Math.floor(r.count) : 0,
  };
}

/** Lo aprendido tal como está ahora: cada preferencia se acerca a cero con el tiempo. */
export function settleLearned(l: Learned, now: number, cfg: LearningConfig): Learned {
  const elapsed = now - l.at;
  if (!(elapsed > 0) || !l.at) return { ...l, at: l.at || now };
  const keep = Math.pow(0.5, elapsed / (cfg.halfLifeDays * DAY_MS));
  const prefs: Record<string, number> = {};
  for (const [id, v] of Object.entries(l.prefs)) {
    const next = round(v * keep);
    if (Math.abs(next) >= FORGOTTEN) prefs[id] = next;
  }
  return { ...l, prefs, at: now };
}

export type ReinforceRefusal = 'unknown_signal' | 'daily_cap';

export interface ReinforceResult {
  state: Learned;
  applied: boolean;
  reason?: ReinforceRefusal;
}

/** Aplica un gesto del entrenador a una conducta. Nunca falla: si no procede, lo dice. */
export function reinforce(l: Learned, behavior: string, signal: string, now: number, cfg: LearningConfig): ReinforceResult {
  const state = settleLearned(l, now, cfg);
  const strength = cfg.signals[signal];
  if (typeof strength !== 'number' || strength === 0) return { state, applied: false, reason: 'unknown_signal' };
  const today = dayOf(now);
  const count = state.day === today ? state.count : 0;
  if (count >= cfg.dailyCap) return { state: { ...state, day: today, count }, applied: false, reason: 'daily_cap' };

  const current = state.prefs[behavior] ?? 0;
  // Se acerca al extremo que marca el signo: cuanto más cerca está, menos avanza
  const next = clamp(current + cfg.rate * Math.abs(strength) * (Math.sign(strength) - current), -1, 1);
  let prefs: Record<string, number> = { ...state.prefs, [behavior]: round(next) };
  const ids = Object.keys(prefs);
  if (ids.length > cfg.maxEntries) {
    // Sobra sitio: se olvida lo más tibio (nunca lo recién tocado)
    const drop = ids.filter((id) => id !== behavior).sort((a, b) => Math.abs(prefs[a]) - Math.abs(prefs[b])).slice(0, ids.length - cfg.maxEntries);
    prefs = Object.fromEntries(Object.entries(prefs).filter(([id]) => !drop.includes(id)));
  }
  return { state: { prefs, at: now, day: today, count: count + 1 }, applied: true };
}

/** Multiplicador que una preferencia aplica al peso de su conducta (1 = sin opinión). */
export function learnedFactor(prefs: Record<string, number> | null | undefined, behavior: string, cfg: LearningConfig): number {
  const v = clamp(prefs?.[behavior] ?? 0, -1, 1);
  return v >= 0 ? 1 + v * (cfg.factor.max - 1) : 1 + v * (1 - cfg.factor.min);
}

/**
 * A qué conducta se atribuye un gesto: a la que está en curso o, si acaba de terminar, a la última.
 * Pasado el margen no se atribuye a nada (el gesto no iba por lo que hizo).
 */
export function creditTarget(active: string | null, lastEnded: { id: string; at: number } | null, now: number, cfg: LearningConfig): string | null {
  if (active) return active;
  if (lastEnded && now - lastEnded.at <= cfg.creditWindowMs) return lastEnded.id;
  return null;
}

/** Lo que más le gusta (o menos) a su entrenador, para enseñarlo. Solo lo que ya es apreciable. */
export function strongestPrefs(prefs: Record<string, number>, n: number, minAbs = 0.15): { id: string; value: number }[] {
  return Object.entries(prefs)
    .filter(([, v]) => Math.abs(v) >= minAbs)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, n)
    .map(([id, value]) => ({ id, value }));
}
