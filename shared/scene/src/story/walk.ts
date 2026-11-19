/**
 * Paseo del Pockai en una escena de la aventura (función pura, sin Pixi): entra andando por la
 * izquierda, se para en el centro —ahí ocurre el evento—, reacciona a la respuesta y sale por la
 * derecha. La posición `x` va en fracción del ancho: fuera por la izquierda es `OFF_LEFT`, el centro
 * es `CENTER` y fuera por la derecha `OFF_RIGHT`.
 */
export type StoryPhase = 'enter' | 'await' | 'react' | 'exit';
export type StoryBeat = 'arrived' | 'reacted' | 'exited';

export const OFF_LEFT = -0.14;
export const CENTER = 0.5;
export const OFF_RIGHT = 1.14;
/** Velocidad del paseo, en anchos por segundo (unos 3 s de la entrada al centro). */
export const WALK_SPEED = 0.21;
/** Lo que dura como mucho la reacción a una respuesta antes de avisar con `reacted`. */
export const REACT_MS = 1800;

export interface WalkState {
  x: number;
  phase: StoryPhase;
  /** Está andando (clip `walk`); si no, en reposo. */
  moving: boolean;
  /** Milisegundos que lleva en la fase `react`. */
  reactMs: number;
  /** Avisos ya emitidos en esta escena: cada uno sale una sola vez. */
  emitted: StoryBeat[];
}

/**
 * Estado inicial de una escena. Si llega directamente en una fase posterior a `enter` (la app se
 * recargó a mitad de escena y repite el último mensaje), el Pockai aparece ya en su sitio, sin
 * volver a andar ni repetir avisos.
 */
export function startWalk(phase: StoryPhase): WalkState {
  if (phase === 'enter') return { x: OFF_LEFT, phase, moving: true, reactMs: 0, emitted: [] };
  if (phase === 'exit') return { x: CENTER, phase, moving: true, reactMs: 0, emitted: ['arrived', 'reacted'] };
  return { x: CENTER, phase, moving: false, reactMs: 0, emitted: ['arrived'] };
}

/** Cambia de fase dentro de la misma escena (las fases solo avanzan; una anterior se ignora). */
export function setPhase(state: WalkState, phase: StoryPhase): WalkState {
  const order: StoryPhase[] = ['enter', 'await', 'react', 'exit'];
  if (order.indexOf(phase) <= order.indexOf(state.phase)) return state;
  // Saltarse la entrada (el anfitrión no esperó a `arrived`): el Pockai se coloca en el centro
  const x = state.phase === 'enter' ? CENTER : state.x;
  const emitted: StoryBeat[] = state.emitted.includes('arrived') ? state.emitted : [...state.emitted, 'arrived'];
  return { ...state, x, phase, moving: phase === 'exit', reactMs: 0, emitted };
}

export interface WalkStep {
  state: WalkState;
  /** Aviso que toca emitir en este paso, si lo hay. */
  beat: StoryBeat | null;
}

/** Avanza el paseo `dtMs` milisegundos. Con `reduced` (movimiento reducido) no anda: llega al instante. */
export function stepWalk(state: WalkState, dtMs: number, reduced = false): WalkStep {
  const emit = (s: WalkState, beat: StoryBeat): WalkStep => (s.emitted.includes(beat) ? { state: s, beat: null } : { state: { ...s, emitted: [...s.emitted, beat] }, beat });
  const dx = (WALK_SPEED * Math.max(0, dtMs)) / 1000;

  switch (state.phase) {
    case 'enter': {
      const x = reduced ? CENTER : Math.min(CENTER, state.x + dx);
      if (x >= CENTER) return emit({ ...state, x: CENTER, moving: false }, 'arrived');
      return { state: { ...state, x, moving: true }, beat: null };
    }
    case 'react': {
      const reactMs = state.reactMs + Math.max(0, dtMs);
      if (reduced || reactMs >= REACT_MS) return emit({ ...state, reactMs, moving: false }, 'reacted');
      return { state: { ...state, reactMs, moving: false }, beat: null };
    }
    case 'exit': {
      const x = reduced ? OFF_RIGHT : Math.min(OFF_RIGHT, state.x + dx);
      if (x >= OFF_RIGHT) return emit({ ...state, x: OFF_RIGHT, moving: false }, 'exited');
      return { state: { ...state, x, moving: true }, beat: null };
    }
    default:
      return { state: state.moving ? { ...state, moving: false } : state, beat: null };
  }
}

/** Posición de la cámara (0-1) para el parallax: sigue al Pockai sin salirse del escenario. */
export function cameraOf(state: WalkState): number {
  return Math.max(0, Math.min(1, state.x));
}
