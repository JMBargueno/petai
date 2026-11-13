import { createRng } from './rng';
import { effectiveStats, equippedSkills, moodMultiplier } from './stats';
import { CombatConfig, Element, Fighter, SkillDef, STAT_KEYS, Strategy } from './types';

/** Reparto de puntos según estrategia (pesos relativos). */
const ALLOCATION_WEIGHTS: Record<Strategy, Record<string, number>> = {
  aggressive: { hp: 1, atk: 3, def: 1, vel: 2, esp: 3 },
  defensive: { hp: 3, atk: 1, def: 3, vel: 1, esp: 2 },
  balanced: { hp: 2, atk: 2, def: 2, vel: 2, esp: 2 },
};

const STRATEGIES: Strategy[] = ['aggressive', 'defensive', 'balanced'];

export interface BotSpecies {
  id: string;
  name: string;
  element: Element;
  baseStats: Record<string, number>;
}

/**
 * Rival fantasma determinista: especie, nivel (±1 respecto al atacante), estrategia y reparto de
 * puntos salen solo de la semilla, así que la misma semilla reproduce siempre el mismo bot.
 * Se usa cuando no hay ningún jugador con un ELO parecido.
 */
export function generateBot(
  seed: number,
  targetLevel: number,
  species: BotSpecies[],
  skillCatalog: SkillDef[],
  cfg: CombatConfig,
): Fighter {
  const rng = createRng(seed);
  const sp = species[Math.floor(rng() * species.length)];
  const level = Math.max(1, targetLevel + Math.floor(rng() * 3) - 1);
  const strategy = STRATEGIES[Math.floor(rng() * STRATEGIES.length)];
  const rarity = 1 + 0.15 * Math.floor(rng() * 3); // 1.0 / 1.15 / 1.30

  const base: Record<string, number> = {};
  for (const k of STAT_KEYS) base[k] = Math.round((sp.baseStats[k] ?? 50) * rarity);

  // 3 puntos por nivel, repartidos según la estrategia (el resto del redondeo va a la estadística con más peso)
  const points = 3 * (level - 1);
  const weights = ALLOCATION_WEIGHTS[strategy];
  const totalWeight = STAT_KEYS.reduce((n, k) => n + weights[k], 0);
  const allocated: Record<string, number> = {};
  let spent = 0;
  for (const k of STAT_KEYS) {
    allocated[k] = Math.floor((points * weights[k]) / totalWeight);
    spent += allocated[k];
  }
  allocated[STAT_KEYS.reduce((a, b) => (weights[b] > weights[a] ? b : a))] += points - spent;

  const pet = { level, combatStats: { ...base, allocated }, skills: [] as string[] };
  return {
    name: `Fantasma de ${sp.name}`,
    speciesId: sp.id,
    element: sp.element,
    level,
    stats: effectiveStats(pet),
    mood: moodMultiplier({ happiness: 100, health: 100, sick: false }, cfg),
    skills: equippedSkills(pet, sp.element, skillCatalog),
    strategy,
    isBot: true,
  };
}
