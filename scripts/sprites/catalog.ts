/**
 * Catálogo único de animaciones del pockai (fuente de verdad del generador de sprites).
 *
 * Cada animación tiene varios frames con su propia duración, si se repite en bucle, su prioridad
 * (una acción de mayor prioridad interrumpe a otra menor) y el grupo al que pertenece:
 *  - base:   estado de fondo en bucle (se deriva del estado de la mascota)
 *  - motion: movimiento por el escritorio (andar, arrastre, caída, trepar…)
 *  - action: reacción de una sola pasada (comer, subir de nivel, ganar…)
 *
 * El generador escribe estos datos en `anim.json` (frameTags) y `animation-specs.json`.
 */
export type AnimGroup = 'base' | 'motion' | 'action';

export interface AnimDef {
  name: string;
  frames: number;
  /** Duración de cada frame en ms. */
  ms: number;
  loop: boolean;
  priority: number;
  group: AnimGroup;
  /** Veces que se reproduce una acción antes de terminar (por defecto 1). */
  repeat?: number;
  easing?: 'linear' | 'easeInQuad' | 'easeOutCubic' | 'easeInOutSine' | 'elastic';
}

export const PET_ANIMATIONS: AnimDef[] = [
  // Base (bucle)
  { name: 'idle', frames: 6, ms: 170, loop: true, priority: 0, group: 'base' },
  { name: 'idle_alt', frames: 6, ms: 170, loop: false, priority: 5, group: 'action' },
  { name: 'sleep', frames: 4, ms: 420, loop: true, priority: 0, group: 'base' },
  { name: 'sick', frames: 4, ms: 260, loop: true, priority: 0, group: 'base' },
  { name: 'sad', frames: 4, ms: 300, loop: true, priority: 0, group: 'base' },
  { name: 'hungry', frames: 4, ms: 260, loop: true, priority: 0, group: 'base' },
  { name: 'tired', frames: 4, ms: 360, loop: true, priority: 0, group: 'base' },
  // Movimiento por el escritorio
  { name: 'walk', frames: 6, ms: 110, loop: true, priority: 10, group: 'motion' },
  { name: 'perch', frames: 4, ms: 260, loop: true, priority: 20, group: 'motion' },
  { name: 'climb', frames: 4, ms: 150, loop: true, priority: 30, group: 'motion' },
  { name: 'fall', frames: 3, ms: 100, loop: true, priority: 80, group: 'motion' },
  { name: 'drag', frames: 4, ms: 130, loop: true, priority: 90, group: 'motion' },
  // Acciones de una pasada
  { name: 'land', frames: 4, ms: 70, loop: false, priority: 85, group: 'action', easing: 'easeOutCubic' },
  { name: 'summon', frames: 6, ms: 90, loop: false, priority: 60, group: 'action', easing: 'elastic' },
  { name: 'talk', frames: 4, ms: 110, loop: false, priority: 20, group: 'action', repeat: 3 },
  { name: 'happy', frames: 6, ms: 100, loop: false, priority: 40, group: 'action', easing: 'elastic', repeat: 2 },
  { name: 'love', frames: 6, ms: 140, loop: false, priority: 40, group: 'action', repeat: 2 },
  { name: 'dance', frames: 8, ms: 110, loop: false, priority: 40, group: 'action', repeat: 3 },
  { name: 'cry', frames: 6, ms: 130, loop: false, priority: 40, group: 'action', repeat: 2 },
  { name: 'eat', frames: 8, ms: 120, loop: false, priority: 50, group: 'action', easing: 'easeInOutSine' },
  { name: 'clean', frames: 8, ms: 110, loop: false, priority: 50, group: 'action', repeat: 2 },
  { name: 'heal', frames: 6, ms: 120, loop: false, priority: 50, group: 'action', repeat: 2 },
  { name: 'wake', frames: 6, ms: 150, loop: false, priority: 50, group: 'action' },
  { name: 'surprised', frames: 4, ms: 90, loop: false, priority: 55, group: 'action' },
  { name: 'celebrate', frames: 8, ms: 100, loop: false, priority: 60, group: 'action', repeat: 2 },
  { name: 'attack', frames: 6, ms: 80, loop: false, priority: 65, group: 'action' },
  { name: 'victory', frames: 8, ms: 120, loop: false, priority: 70, group: 'action' },
  { name: 'defeat', frames: 6, ms: 160, loop: false, priority: 70, group: 'action' },
  { name: 'hit', frames: 4, ms: 80, loop: false, priority: 75, group: 'action' },
  { name: 'level_up', frames: 8, ms: 100, loop: false, priority: 95, group: 'action', repeat: 2 },
  { name: 'evolution', frames: 10, ms: 120, loop: false, priority: 100, group: 'action' },
];

export const EGG_ANIMATIONS: AnimDef[] = [
  { name: 'idle', frames: 4, ms: 260, loop: true, priority: 0, group: 'base' },
  { name: 'shake', frames: 6, ms: 70, loop: true, priority: 30, group: 'action' },
  { name: 'crack', frames: 6, ms: 140, loop: false, priority: 60, group: 'action' },
  { name: 'hatch', frames: 8, ms: 110, loop: false, priority: 95, group: 'action' },
];

/** Alias de nombres antiguos o recomendados → animación existente. */
export const ANIMATION_ALIASES: Record<string, string> = {
  sit: 'perch',
  hurt: 'hit',
  faint: 'defeat',
  cast: 'attack',
};
