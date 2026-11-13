/**
 * ELO, ligas y emparejamiento: funciones puras (sin base de datos) para poder probarlas aisladas.
 */

export interface EloConfig {
  initial: number;
  k: number;
  floor: number;
  window: number;
  maxWindow: number;
  windowStep: number;
}

export interface League {
  id: string;
  name: string;
  minElo: number;
}

// ---------- ELO ----------

export function expectedScore(rating: number, opponent: number): number {
  return 1 / (1 + Math.pow(10, (opponent - rating) / 400));
}

/** score: 1 victoria, 0.5 empate, 0 derrota (desde el punto de vista del primero). */
export function applyElo(
  ratingA: number,
  ratingB: number,
  scoreA: 0 | 0.5 | 1,
  cfg: Pick<EloConfig, 'k' | 'floor'>,
): { deltaA: number; deltaB: number; newA: number; newB: number } {
  const expected = expectedScore(ratingA, ratingB);
  let deltaA = Math.round(cfg.k * (scoreA - expected));
  let deltaB = -deltaA; // suma cero: lo que gana uno lo pierde el otro
  // El ELO no baja del suelo
  if (ratingA + deltaA < cfg.floor) deltaA = cfg.floor - ratingA;
  if (ratingB + deltaB < cfg.floor) deltaB = cfg.floor - ratingB;
  return { deltaA, deltaB, newA: ratingA + deltaA, newB: ratingB + deltaB };
}

// ---------- Ligas ----------

export function leagueFor(elo: number, leagues: League[]): League & { next: League | null; toNext: number | null } {
  const sorted = [...leagues].sort((a, b) => a.minElo - b.minElo);
  let idx = 0;
  for (let i = 0; i < sorted.length; i++) if (elo >= sorted[i].minElo) idx = i;
  const next = sorted[idx + 1] ?? null;
  return { ...sorted[idx], next, toNext: next ? next.minElo - elo : null };
}

// ---------- Emparejamiento ----------

export interface Candidate {
  petId: string;
  elo: number;
}

/**
 * Elige un rival con ELO parecido: la ventana se amplía por pasos hasta `maxWindow`; dentro de la
 * primera ventana con candidatos se elige entre los `pool` más cercanos con el azar inyectado.
 * Devuelve null si no hay nadie dentro de la ventana máxima.
 */
export function pickOpponent<T extends Candidate>(
  candidates: T[],
  myElo: number,
  cfg: Pick<EloConfig, 'window' | 'maxWindow' | 'windowStep'>,
  rng: () => number,
  pool = 5,
): T | null {
  for (let w = cfg.window; w <= cfg.maxWindow; w += cfg.windowStep) {
    const inside = candidates
      .filter((c) => Math.abs(c.elo - myElo) <= w)
      .sort((a, b) => Math.abs(a.elo - myElo) - Math.abs(b.elo - myElo) || a.petId.localeCompare(b.petId));
    if (inside.length > 0) {
      const top = inside.slice(0, pool);
      return top[Math.min(top.length - 1, Math.floor(rng() * top.length))];
    }
  }
  return null;
}

// ---------- Semanas (clasificación semanal) ----------

/** Clave de semana ISO en UTC, p. ej. "2026-W46". */
export function isoWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // lunes=1 … domingo=7
  d.setUTCDate(d.getUTCDate() + 4 - day); // jueves de la misma semana
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
