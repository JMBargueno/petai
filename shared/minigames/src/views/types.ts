import type { GameInput } from '../core/types';

/** Lo que la vista puede hacer: encolar entradas para el siguiente tick. */
export interface ViewContext {
  push(input: GameInput): void;
  reducedMotion: boolean;
}

/**
 * Vista DOM de un juego. Solo pinta el estado y traduce ratón, teclado y toque a entradas: nunca
 * cambia el estado directamente, así la partida se puede repetir con el registro de entradas.
 */
export interface GameView<S> {
  mount(root: HTMLElement, ctx: ViewContext): void;
  render(state: S): void;
  /** Texto del marcador (lado derecho del HUD). */
  status(state: S): string;
  dispose(): void;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

/** Convierte la posición del puntero a coordenadas lógicas del juego (la arena se escala). */
export function toLogical(e: PointerEvent, arena: HTMLElement, w: number, h: number) {
  const r = arena.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / Math.max(1, r.width)) * w,
    y: ((e.clientY - r.top) / Math.max(1, r.height)) * h,
  };
}

/** Porcentaje para colocar un elemento en la arena escalable. */
export const pct = (v: number, total: number) => `${((v / total) * 100).toFixed(3)}%`;
