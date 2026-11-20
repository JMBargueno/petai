/**
 * Motor de animación de la mascota, independiente del render (testeable sin DOM).
 *
 * Tres capas, de abajo arriba:
 *  - base:   bucle derivado del estado de la mascota (idle, sleep, sick, hungry…)
 *  - motion: movimiento por el escritorio (walk, climb, perch, fall, drag)
 *  - action: reacciones de una pasada (eat, level_up, victory…) con prioridad y cola
 *
 * Se ve la acción si su prioridad es ≥ que la del movimiento actual; si no, el movimiento;
 * y si no hay ninguno de los dos, la base. Cada frame dura lo que diga su clip (no un tick fijo).
 */
export type AnimGroup = 'base' | 'motion' | 'action';

export interface AnimClip {
  name: string;
  /** Duración en ms de cada frame del clip. */
  durations: number[];
  loop: boolean;
  priority: number;
  group: AnimGroup;
  /** Veces que se reproduce una acción antes de terminar. */
  repeat: number;
}

export type AnimLibrary = Record<string, AnimClip>;

export interface AnimFrame {
  name: string;
  frame: number;
}

interface Playing {
  clip: AnimClip;
  t: number;
}

const MAX_QUEUE = 3;

export function clipLength(clip: AnimClip): number {
  return clip.durations.reduce((a, b) => a + b, 0);
}

/** Índice de frame dentro del clip para un tiempo dado (en bucle o detenido en el último). */
export function frameAt(clip: AnimClip, t: number): number {
  const cycle = clipLength(clip);
  if (cycle <= 0 || clip.durations.length === 0) return 0;
  let local: number;
  if (clip.loop) {
    local = ((t % cycle) + cycle) % cycle;
  } else {
    const total = cycle * Math.max(1, clip.repeat);
    local = Math.min(Math.max(0, t), total - 1) % cycle;
  }
  let acc = 0;
  for (let i = 0; i < clip.durations.length; i++) {
    acc += clip.durations[i];
    if (local < acc) return i;
  }
  return clip.durations.length - 1;
}

export class AnimationController {
  private base: Playing;
  private motion: Playing | null = null;
  private action: Playing | null = null;
  private queue: AnimClip[] = [];

  /** Se llama cuando una acción termina (no cuando la interrumpe otra). */
  onFinish: ((name: string) => void) | null = null;

  constructor(
    private library: AnimLibrary,
    private aliases: Record<string, string> = {},
    baseName = 'idle',
  ) {
    this.base = { clip: this.resolve(baseName) ?? this.firstClip(), t: 0 };
  }

  private firstClip(): AnimClip {
    const first = Object.values(this.library)[0];
    if (!first) throw new Error('AnimationController: biblioteca de animaciones vacía');
    return first;
  }

  /** Busca un clip por nombre o alias. */
  resolve(name: string): AnimClip | null {
    return this.library[name] ?? this.library[this.aliases[name] ?? ''] ?? null;
  }

  has(name: string): boolean {
    return this.resolve(name) !== null;
  }

  /** Cambia la biblioteca (p. ej. otra especie) conservando lo que se está reproduciendo si existe. */
  setLibrary(library: AnimLibrary, aliases: Record<string, string> = this.aliases) {
    this.library = library;
    this.aliases = aliases;
    const swap = (p: Playing | null) => {
      if (!p) return null;
      const clip = this.resolve(p.clip.name);
      return clip ? { clip, t: p.t } : null;
    };
    this.base = swap(this.base) ?? { clip: this.resolve('idle') ?? this.firstClip(), t: 0 };
    this.motion = swap(this.motion);
    this.action = swap(this.action);
    this.queue = this.queue.map((c) => this.resolve(c.name)).filter((c): c is AnimClip => !!c);
  }

  setBase(name: string) {
    const clip = this.resolve(name);
    if (!clip || clip.name === this.base.clip.name) return;
    this.base = { clip, t: 0 };
  }

  get baseName(): string {
    return this.base.clip.name;
  }

  /** Movimiento actual (`null` = quieto). No reinicia el clip si ya era el mismo. */
  setMotion(name: string | null) {
    if (name === null) {
      this.motion = null;
      return;
    }
    const clip = this.resolve(name);
    if (!clip) {
      this.motion = null;
      return;
    }
    if (this.motion?.clip.name === clip.name) return;
    this.motion = { clip, t: 0 };
  }

  get motionName(): string | null {
    return this.motion?.clip.name ?? null;
  }

  /**
   * Reproduce una acción. Si hay otra de prioridad mayor en curso, entra en cola.
   * Devuelve `false` si la animación no existe.
   */
  play(name: string): boolean {
    const clip = this.resolve(name);
    if (!clip) return false;
    if (!this.action || clip.priority >= this.action.clip.priority) {
      if (this.action && this.action.clip.name === clip.name) {
        this.action.t = 0; // reinicia la misma acción
      } else {
        this.action = { clip, t: 0 };
      }
      return true;
    }
    if (!this.queue.some((c) => c.name === clip.name)) {
      this.queue.push(clip);
      this.queue.sort((a, b) => b.priority - a.priority);
      if (this.queue.length > MAX_QUEUE) this.queue.length = MAX_QUEUE;
    }
    return true;
  }

  /** Corta la acción en curso (o solo si coincide con `name`) y vacía la cola. */
  stop(name?: string) {
    if (!name || this.action?.clip.name === name) {
      this.action = null;
      this.queue = [];
    }
  }

  /** Acción en curso (aunque la tape un movimiento de más prioridad). */
  get actionName(): string | null {
    return this.action?.clip.name ?? null;
  }

  get actionPriority(): number {
    return this.action?.clip.priority ?? -1;
  }

  /** Nombre del clip visible ahora mismo. */
  get current(): string {
    return this.visible().clip.name;
  }

  private visible(): Playing {
    if (this.action && (!this.motion || this.action.clip.priority >= this.motion.clip.priority)) return this.action;
    return this.motion ?? this.base;
  }

  /** Avanza `dt` ms y devuelve el frame que hay que dibujar. */
  update(dt: number): AnimFrame {
    const step = Math.max(0, dt);
    this.base.t += step;
    if (this.motion) this.motion.t += step;
    if (this.action) {
      this.action.t += step;
      const clip = this.action.clip;
      const total = clipLength(clip) * Math.max(1, clip.repeat);
      if (!clip.loop && this.action.t >= total) {
        const finished = clip.name;
        const next = this.queue.shift();
        this.action = next ? { clip: next, t: 0 } : null;
        this.onFinish?.(finished);
      }
    }
    const v = this.visible();
    return { name: v.clip.name, frame: frameAt(v.clip, v.t) };
  }
}

/** Estado base según la mascota: dormida, enferma o con algún vital bajo. */
export function resolveBaseState(
  pet: { sleeping?: boolean; sick?: boolean; hunger?: number; energy?: number; happiness?: number; health?: number } | null | undefined,
  low = 20,
): string {
  if (!pet) return 'idle';
  if (pet.sleeping) return 'sleep';
  if (pet.sick || (typeof pet.health === 'number' && pet.health < low)) return 'sick';
  if (typeof pet.hunger === 'number' && pet.hunger < low) return 'hungry';
  if (typeof pet.energy === 'number' && pet.energy < low) return 'tired';
  if (typeof pet.happiness === 'number' && pet.happiness < low) return 'sad';
  return 'idle';
}
