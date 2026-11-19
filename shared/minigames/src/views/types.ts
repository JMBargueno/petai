import type { GameInput } from '../core/types';
import type { PetActor } from '../pet';

/** Lo que la vista puede hacer: encolar entradas para el siguiente tick. */
export interface ViewContext {
  push(input: GameInput): void;
  reducedMotion: boolean;
  /** La mascota del jugador, lista para colocar en la arena (ver pet.ts). */
  pet: PetActor;
}

/**
 * Vista DOM de un juego. Solo pinta el estado y traduce ratón, teclado y toque a entradas: nunca
 * cambia el estado directamente, así la partida se puede repetir con el registro de entradas.
 */
export interface GameView<S> {
  mount(root: HTMLElement, ctx: ViewContext, initial: S): void;
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

/** Escucha un evento y devuelve la función que lo quita. */
export function on<T extends EventTarget>(target: T, type: string, fn: (e: never) => void, opts?: AddEventListenerOptions) {
  target.addEventListener(type, fn as EventListener, opts);
  return () => target.removeEventListener(type, fn as EventListener, opts);
}

/**
 * Botón de tipo `button` con texto y etiqueta accesible. `own`: es un mando del juego (sus teclas las
 * gestiona el juego); los demás botones (Seguir, Salir de la app…) conservan Espacio y Enter.
 */
export function button(cls: string, text: string, label?: string, own = true): HTMLButtonElement {
  const b = el('button', cls, text);
  b.type = 'button';
  if (label) b.setAttribute('aria-label', label);
  if (own) b.dataset.pmgOwn = '';
  return b;
}

/**
 * La tecla es de otro control y el juego no debe quedársela: se escribe en un campo, o el foco está en
 * un botón o enlace que no es un mando del juego (p. ej. «Seguir» de la pausa o «Salir» de la app).
 */
export const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  if (!t || !t.tagName) return false;
  if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return true;
  return (t.tagName === 'BUTTON' || t.tagName === 'A') && !t.closest('[data-pmg-own]');
};

/** Porcentaje para colocar un elemento en la arena escalable. */
export const pct = (v: number, total: number) => `${((v / total) * 100).toFixed(3)}%`;
