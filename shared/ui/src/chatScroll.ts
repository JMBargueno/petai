/**
 * Autoscroll de un hilo de chat que no molesta: solo baja al final si el usuario ya estaba
 * abajo. Si ha subido a leer mensajes antiguos, se le deja donde está.
 */
type Scrollable = Pick<HTMLElement, 'scrollTop' | 'scrollHeight' | 'clientHeight'>;

/** Margen en px para considerar que «está abajo» (un mensaje a medio entrar no cuenta). */
export const STICK_THRESHOLD = 48;

export function isNearBottom(el: Scrollable, threshold = STICK_THRESHOLD): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}

/**
 * Devuelve una función para llamar ANTES de añadir contenido; ella misma devuelve otra para
 * llamar DESPUÉS (tras `tick()`), que baja al final solo si procede.
 *
 *   const settle = stickToBottom(logEl);
 *   messages = [...messages, m];
 *   await tick();
 *   settle();
 */
export function stickToBottom(el: (Scrollable & { scrollTo?: HTMLElement['scrollTo'] }) | null | undefined, force = false) {
  const stick = !!el && (force || isNearBottom(el));
  return () => {
    if (el && stick) el.scrollTop = el.scrollHeight;
  };
}
