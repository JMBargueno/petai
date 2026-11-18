// Ruta relativa: el paquete importa su código fuente y debe cargar igual en Node, escritorio, web y escena.
import speciesData from '../../../game-data/species.json';

/**
 * Elemento de una especie según el catálogo compartido. Sirve para teñir efectos de mascotas que
 * no traen su elemento, como las de los amigos de visita (`PetIdentity` solo trae la especie).
 */
const ELEMENT_BY_SPECIES: Record<string, string> = Object.fromEntries(
  (speciesData as Array<{ id: string; element?: string }>).map((s) => [s.id, s.element ?? 'neutral']),
);

export function speciesElement(speciesId: string | null | undefined): string {
  return (speciesId && ELEMENT_BY_SPECIES[speciesId]) || 'neutral';
}
