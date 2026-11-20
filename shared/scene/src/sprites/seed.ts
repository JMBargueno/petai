/**
 * Semilla visual estable para una mascota de la que solo se conoce un id (un visitante, un
 * luchador de una repetición): el mismo id da siempre el mismo dibujo.
 */
export function visitorSeed(visitorId: string): number {
  let h = 0x811c9dc5; // FNV-1a
  for (let i = 0; i < visitorId.length; i++) {
    h ^= visitorId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 99991 || 1337;
}
