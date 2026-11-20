/**
 * Momentos de la interfaz que una app puede querer acompañar (con un sonido, una vibración…).
 *
 * Los componentes no suenan ni vibran: avisan aquí y cada app decide. El escritorio los enlaza con
 * sus efectos de sonido; en móvil pueden ser hápticos, o nada.
 */
export type UiFeedback = 'modalOpen' | 'modalClose' | 'coinGain' | 'gemGain';

const listeners = new Set<(kind: UiFeedback) => void>();

/** Atiende los avisos de los componentes. Devuelve cómo dejar de atenderlos. */
export function onUiFeedback(cb: (kind: UiFeedback) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Lo llaman los componentes; un fallo en quien escucha no rompe la interfaz. */
export function emitUiFeedback(kind: UiFeedback): void {
  for (const cb of listeners) {
    try {
      cb(kind);
    } catch {
      /* el aviso es un extra: nunca debe romper el componente */
    }
  }
}
