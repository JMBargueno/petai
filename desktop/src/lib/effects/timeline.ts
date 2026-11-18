import type { FxPhase } from './types';

export interface TimelineState {
  phase: string;
  /** Progreso 0..1 dentro de la fase. */
  t: number;
  done: boolean;
}

/**
 * Reproductor de fases sin dependencias de navegador (se prueba con tiempos inventados).
 * `tick(now)` dice en qué fase está; una fase `hold` se queda ahí hasta `release(now)`.
 * Avisa de cada fase nueva con `onPhase`, una sola vez y en orden, aunque un tick se salte varias.
 */
export class EffectPlayer {
  private startAt = 0;
  private releasedAt: number | null = null;
  private lastIndex = -1;
  private finished = false;

  constructor(
    private readonly phases: FxPhase[],
    private readonly onPhase: (name: string) => void = () => {},
  ) {}

  start(now: number): void {
    this.startAt = now;
    this.releasedAt = null;
    this.lastIndex = -1;
    this.finished = false;
  }

  /** Suelta la fase `hold` en curso (o la próxima, si aún no ha llegado). */
  release(now: number): void {
    if (this.releasedAt === null) this.releasedAt = now;
  }

  get done(): boolean {
    return this.finished;
  }

  /** ms transcurridos desde `start`. */
  elapsed(now: number): number {
    return Math.max(0, now - this.startAt);
  }

  tick(now: number): TimelineState {
    const state = this.resolve(now);
    const index = this.phases.findIndex((p) => p.name === state.phase);
    const upTo = state.done ? this.phases.length - 1 : index;
    while (this.lastIndex < upTo) {
      this.lastIndex++;
      this.onPhase(this.phases[this.lastIndex].name);
    }
    if (state.done && !this.finished) {
      this.finished = true;
      this.onPhase('done');
    }
    return state;
  }

  private resolve(now: number): TimelineState {
    let cursor = this.startAt;
    for (const p of this.phases) {
      if (p.ms === 'hold') {
        // La espera termina al soltarla; si se soltó antes de llegar, se pasa de largo.
        if (this.releasedAt === null || now < this.releasedAt) {
          if (now >= cursor) return { phase: p.name, t: 0, done: false };
        }
        cursor = Math.max(cursor, this.releasedAt ?? cursor);
        continue;
      }
      if (now < cursor + p.ms) {
        return { phase: p.name, t: p.ms > 0 ? Math.max(0, (now - cursor) / p.ms) : 1, done: false };
      }
      cursor += p.ms;
    }
    const last = this.phases[this.phases.length - 1];
    return { phase: last?.name ?? '', t: 1, done: true };
  }
}

/** Duración total sin contar las fases `hold`. */
export function fixedDuration(phases: FxPhase[]): number {
  return phases.reduce((acc, p) => acc + (p.ms === 'hold' ? 0 : p.ms), 0);
}

/** Cuantiza el tiempo a la cadencia del efecto, como los frames de un sprite. */
export function quantize(ms: number, fps: number): number {
  const step = 1000 / fps;
  return Math.floor(ms / step) * step;
}
