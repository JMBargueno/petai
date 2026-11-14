/**
 * Motor de combate empaquetado como módulo PURO y exportable para el balance simulator.
 *
 * NO hace I/O: no lee el reloj, la base de datos ni `Math.random`. Todo el azar sale del PRNG
 * `mulberry32` (`createRng`) sembrado con la semilla que el llamador proporcione, por lo que la
 * misma semilla + los mismos game-data producen SIEMPRE el mismo reporte, byte a byte
 * (constitución II). El motor real es `engine.ts` (`simulateBattle`); aquí solo se aísla la
 * generación determinista de luchadores y la agregación del reporte.
 */
import { simulateBattle } from './engine';
import { createRng } from './rng';
import { CombatConfig, Fighter, SkillDef, STAT_KEYS, StatKey, Strategy } from './types';
import { LEVEL_STAT_BONUS, equippedSkills, moodMultiplier } from './stats';

const STRATEGIES: Strategy[] = ['aggressive', 'defensive', 'balanced'];

/** Config de combate extraída de `balance.combats`. */
export function buildCombatConfig(balance: any): CombatConfig {
  const c = balance?.combats;
  if (!c) throw new Error('balance.combats ausente para construir el config de combate');
  return {
    maxRounds: c.maxRounds,
    hpMultiplier: c.hpMultiplier,
    damageScale: c.damageScale,
    critChance: c.critChance,
    critMultiplier: c.critMultiplier,
    elementAdvantage: c.elementAdvantage,
    elementDisadvantage: c.elementDisadvantage,
    burnPctPerTurn: c.burnPctPerTurn,
    guardDefMultiplier: c.guardDefMultiplier,
    mood: c.mood,
  };
}

export interface SimContext {
  species: any[];
  skills: SkillDef[];
  balance: any;
}

/**
 * Genera un luchador determinista a partir de un PRNG sembrado. El orden de las llamadas al PRNG
 * es fijo (especie → nivel → happiness → health → sick), de modo que la simulación es reproducible.
 * `seq` solo se usa para el nombre (no afecta el resultado del combate).
 */
export function createSimFighter(rng: () => number, ctx: SimContext, seq: number): Fighter {
  const { species, skills, balance } = ctx;
  if (species.length === 0) throw new Error('No hay especies para simular');

  const sp = species[Math.floor(rng() * species.length)];
  const maxLevel = balance?.leveling?.maxLevel ?? 100;
  const minLevel = balance?.combats?.minLevel ?? 1;
  const level = minLevel + Math.floor(rng() * (maxLevel - minLevel + 1));

  const rarityMult = balance?.rarity?.[sp.rarity]?.multiplier ?? 1;
  const base = sp.baseStats ?? {};
  const stats = {} as Record<StatKey, number>;
  for (const k of STAT_KEYS) {
    stats[k] = Math.round((Number(base[k]) || 1) * rarityMult * (1 + LEVEL_STAT_BONUS * level));
  }

  const happiness = Math.round(rng() * 100);
  const health = Math.round(rng() * 100);
  const sick = rng() < 0.1;
  const mood = moodMultiplier({ happiness, health, sick }, buildCombatConfig(balance));

  return {
    name: `${sp.name}#${seq}`,
    speciesId: sp.id,
    element: sp.element,
    level,
    stats,
    mood,
    skills: equippedSkills({ level, skills: [] }, sp.element, skills),
    strategy: STRATEGIES[Math.floor(rng() * STRATEGIES.length)],
    isBot: true,
  };
}

/** Reporte determinista del balance simulator (mismo seed ⇒ mismo objeto, byte a byte). */
export interface SimReport {
  seed: number;
  total: number;
  winRates: {
    byRarity: Record<string, number>;
    byElement: Record<string, number>;
  };
  avgRounds: number;
  avgDamage: number;
}

export interface BalanceSimInput {
  species: any[];
  skills: SkillDef[];
  balance: any;
  /** Nº de combates a simular (> 0). */
  combats: number;
  /** Semilla del PRNG determinista. */
  seed: number;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/**
 * Simula `combats` combates in-memory con un PRNG sembrado y agrega win rates por rareza/elemento,
 * rondas promedio y daño promedio. Determinista: el resultado depende solo de `seed` y los
 * game-data de `ctx`.
 */
export function simulateBalance(input: BalanceSimInput): SimReport {
  const { species, skills, balance, combats, seed } = input;
  if (!Number.isInteger(combats) || combats <= 0) {
    throw new Error(`combats debe ser un entero > 0 (recibido ${combats})`);
  }
  const cfg = buildCombatConfig(balance);
  const ctx: SimContext = { species, skills, balance };
  const rng = createRng(seed);

  const rarityAppear = new Map<string, { wins: number; total: number }>();
  const elementAppear = new Map<string, { wins: number; total: number }>();
  const bump = (map: Map<string, { wins: number; total: number }>, key: string, win: boolean) => {
    const cur = map.get(key) ?? { wins: 0, total: 0 };
    cur.total += 1;
    if (win) cur.wins += 1;
    map.set(key, cur);
  };

  let totalRounds = 0;
  let totalDamage = 0;

  for (let i = 0; i < combats; i++) {
    const attacker = createSimFighter(rng, ctx, i);
    const defender = createSimFighter(rng, ctx, i + combats);
    const battleSeed = Math.floor(rng() * 0x100000000);
    const result = simulateBattle(attacker, defender, battleSeed, cfg);

    totalRounds += result.rounds;
    for (const ev of result.log.events) {
      const dmg = (ev as { damage?: number }).damage;
      if (typeof dmg === 'number') totalDamage += dmg;
    }

    const attackerWon = result.winner === 0;
    const defenderWon = result.winner === 1;
    const attackerRarity = species.find((s) => s.id === attacker.speciesId)?.rarity ?? '';
    const defenderRarity = species.find((s) => s.id === defender.speciesId)?.rarity ?? '';
    bump(rarityAppear, attackerRarity, attackerWon);
    bump(rarityAppear, defenderRarity, defenderWon);
    bump(elementAppear, attacker.element, attackerWon);
    bump(elementAppear, defender.element, defenderWon);
  }

  // Orden determinista de claves: rarezas por su posición en balance.rarity, elementos en fijo.
  const rarityOrder = Object.keys(balance?.rarity ?? {});
  const elementOrder: string[] = ['fire', 'water', 'plant', 'electric', 'shadow', 'light'];

  const byRarity: Record<string, number> = {};
  for (const key of rarityOrder) {
    const v = rarityAppear.get(key);
    if (v && v.total > 0) byRarity[key] = round2(v.wins / v.total);
  }
  const byElement: Record<string, number> = {};
  for (const key of elementOrder) {
    const v = elementAppear.get(key);
    if (v && v.total > 0) byElement[key] = round2(v.wins / v.total);
  }

  return {
    seed,
    total: combats,
    winRates: { byRarity, byElement },
    avgRounds: round2(totalRounds / combats),
    avgDamage: round2(totalDamage / combats),
  };
}