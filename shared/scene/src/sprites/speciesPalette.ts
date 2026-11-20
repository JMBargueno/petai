// Ruta relativa (no el alias @shared): la resuelven todas las apps y Node (tests).
import speciesData from '../../../game-data/species.json';

export interface SpeciesPalette {
  primary: string;
  secondary: string;
  accent?: string;
}

const FALLBACK: SpeciesPalette = { primary: '#E25822', secondary: '#F3C544', accent: '#6D1600' };

const PALETTE_BY_SPECIES: Record<string, SpeciesPalette> = Object.fromEntries(
  (speciesData as Array<{ id: string; defaultPalette?: SpeciesPalette }>)
    .filter((s) => s.defaultPalette?.primary && s.defaultPalette?.secondary)
    .map((s) => [s.id, s.defaultPalette!]),
);

/**
 * Paleta por defecto de una especie (catálogo compartido). Sirve para dibujar mascotas de las que
 * solo se conoce la especie, como los luchadores de una repetición de combate.
 */
export function speciesPalette(speciesId: string | null | undefined): SpeciesPalette {
  return (speciesId && PALETTE_BY_SPECIES[speciesId]) || FALLBACK;
}
