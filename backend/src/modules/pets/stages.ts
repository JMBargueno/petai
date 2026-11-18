/** Etapas evolutivas en orden. La forma `final` requiere un objeto (ver `PetsService.evolve`). */
export const STAGE_ORDER = ['baby', 'juvenile', 'adult', 'final'] as const;
export type Stage = (typeof STAGE_ORDER)[number];

/** Umbrales por defecto (coinciden con `balance.leveling.stages` de game-data). */
const DEFAULT_STAGE_LEVELS: Record<string, number> = { juvenile: 10, adult: 25 };

/**
 * Etapa que alcanza automáticamente una mascota por su nivel (juvenil/adulto). Nunca devuelve
 * `final`: esa forma no llega sola, se desbloquea con un objeto.
 */
export function stageForLevel(level: number, stages?: Record<string, number> | null): Exclude<Stage, 'final'> {
  const adult = stages?.adult ?? DEFAULT_STAGE_LEVELS.adult;
  const juvenile = stages?.juvenile ?? DEFAULT_STAGE_LEVELS.juvenile;
  if (level >= adult) return 'adult';
  if (level >= juvenile) return 'juvenile';
  return 'baby';
}
