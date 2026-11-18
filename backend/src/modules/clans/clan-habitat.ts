/**
 * Hábitat del Nexo (funciones puras): nivel visual según la XP del clan y sorteo de residentes.
 * Los niveles viven en `shared/game-data/clan-habitat.json` (el escritorio lee el mismo archivo).
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const DATA: ClanHabitatData = require('../../../../shared/game-data/clan-habitat.json');

export interface ClanHabitatTierDef {
  level: number;
  id: string;
  name: string;
  minXp: number;
  tagline: string;
}

export interface ClanHabitatData {
  maxResidents: number;
  tiers: ClanHabitatTierDef[];
}

export const HABITAT_TIERS: ClanHabitatTierDef[] = [...DATA.tiers].sort((a, b) => a.minXp - b.minXp);
export const MAX_RESIDENTS: number = DATA.maxResidents;

/** Nivel del hábitat para `xp` (el más alto cuyo umbral se alcanza). */
export function habitatTier(xp: number): ClanHabitatTierDef {
  const value = Math.max(0, Number.isFinite(xp) ? xp : 0);
  let tier = HABITAT_TIERS[0];
  for (const t of HABITAT_TIERS) if (value >= t.minXp) tier = t;
  return tier;
}

/** Umbral del siguiente nivel, o `null` si ya está en el máximo. */
export function nextTierXp(xp: number): number | null {
  const current = habitatTier(xp);
  return HABITAT_TIERS.find((t) => t.minXp > current.minXp)?.minXp ?? null;
}

/**
 * Sorteo de residentes: como mucho `max` usuarios distintos. El espectador entra siempre si tiene
 * pockai; el resto se baraja (Fisher–Yates) y se corta. `random` es inyectable para los tests.
 */
export function pickResidents(
  candidates: string[],
  viewerId: string,
  max: number = MAX_RESIDENTS,
  random: () => number = Math.random,
): string[] {
  const unique = [...new Set(candidates)];
  const others = unique.filter((id) => id !== viewerId);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const picked = unique.includes(viewerId) ? [viewerId, ...others] : others;
  return picked.slice(0, Math.max(0, max));
}
