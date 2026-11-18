/**
 * Evolution Engine (spec 36) — funciones puras.
 *
 * Interpreta experiencias (eventos de dominio, conversación, vida autónoma) como pequeños cambios
 * en las cinco dimensiones. Reglas:
 * - Cada evento tiene deltas en balance.personality.evolution.events.
 * - Tope diario por dimensión (`dailyCapPerDimension`, en valor absoluto acumulado).
 * - Elasticidad: alejarse de 50 cuesta más cuanto más extremo es el valor (los rasgos se forman
 *   despacio y nunca se disparan); volver hacia el centro no se frena.
 * El resultado: dos criaturas idénticas divergen según cómo se las trate.
 */
import { DIMENSIONS, Dims, DriftState, PersonalityConfig } from './mind.types';
import { clampDim } from './personality.engine';

export function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export interface DriftResult {
  dims: Dims;
  drift: DriftState;
  changed: boolean;
}

export function applyDrift(
  dims: Dims,
  deltas: Partial<Dims> | undefined,
  state: DriftState | undefined,
  now: Date,
  cfg: PersonalityConfig,
  multiplier = 1,
): DriftResult {
  const today = dayKey(now);
  const used: Partial<Dims> = state?.day === today ? { ...state.used } : {};
  const out = { ...dims };
  let changed = false;
  if (!deltas) return { dims: out, drift: { day: today, used }, changed };

  const cap = cfg.evolution.dailyCapPerDimension;
  for (const d of DIMENSIONS) {
    let delta = (deltas[d] ?? 0) * multiplier;
    if (!delta) continue;
    const v = out[d];
    const awayFromCenter = (v - 50) * delta > 0;
    if (awayFromCenter) {
      const extremity = Math.abs(v - 50) / 50;
      delta *= 1 - cfg.evolution.elasticity * extremity * extremity;
    }
    const remaining = Math.max(0, cap - (used[d] ?? 0));
    const applied = Math.sign(delta) * Math.min(Math.abs(delta), remaining);
    if (!applied) continue;
    const next = clampDim(v + applied);
    if (next === v) continue;
    used[d] = Math.round(((used[d] ?? 0) + Math.abs(next - v)) * 1000) / 1000;
    out[d] = next;
    changed = true;
  }
  return { dims: out, drift: { day: today, used }, changed };
}

/** Aplica varios eventos seguidos (p. ej. la vida autónoma de un intervalo largo). */
export function applyEvents(
  dims: Dims,
  events: string[],
  state: DriftState | undefined,
  now: Date,
  cfg: PersonalityConfig,
): DriftResult {
  let res: DriftResult = { dims, drift: state ?? { day: dayKey(now), used: {} }, changed: false };
  for (const ev of events) {
    const next = applyDrift(res.dims, cfg.evolution.events[ev], res.drift, now, cfg);
    res = { ...next, changed: res.changed || next.changed };
  }
  return res;
}
