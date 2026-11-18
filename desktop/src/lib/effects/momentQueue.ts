import type { EffectDef } from './types';

/**
 * Qué hacer con un efecto de momento nuevo cuando ya hay otros en curso alrededor de la mascota.
 * Solo cabe uno grande a la vez: el de más peso (`priority`) gana. Si llega uno con más peso,
 * sustituye a los de menos (la evolución corta la subida de nivel que llega en el mismo tick); si
 * llega con el mismo peso o menos, se descarta.
 */
export function admitMoment(
  active: ReadonlyArray<{ def: EffectDef }>,
  incoming: EffectDef,
): { play: boolean; replace: number[] } {
  const weight = (d: EffectDef) => d.priority ?? 1;
  const w = weight(incoming);
  const replace: number[] = [];
  for (let i = 0; i < active.length; i++) {
    if (weight(active[i].def) >= w) return { play: false, replace: [] };
    replace.push(i);
  }
  return { play: true, replace };
}
