/**
 * Schemas zod de los game-data de `shared/game-data/*.json`.
 *
 * Estos schemas centralizan la validación estructural (tipo/forma) de cada archivo y la lógica
 * de integridad entre archivos (referencias cruzadas). Se reutilizan en:
 *  - `GameDataService.reload()` para el hot-reload atómico (rechazo de snapshot inválido).
 *  - el watcher `game-data-watcher.service.ts`.
 *  - el CLI `petai-devkit validate` y `simulate`.
 *
 * Las reglas semánticas de `validateGameData()` replican `scripts/validate-game-data.js`, de modo
 * que el hot-reload y el CLI `validate` comparten la misma fuente de verdad de integridad.
 */
import { z } from 'zod';

export const ELEMENTS = ['fire', 'water', 'plant', 'electric', 'shadow', 'light'] as const;
export type ElementValue = (typeof ELEMENTS)[number];

export const GAME_DATA_FILES = ['balance', 'species', 'patterns', 'foods', 'skills', 'missions', 'achievements', 'constellations'] as const;
export type GameDataFileKey = (typeof GAME_DATA_FILES)[number];

// Categorías y tiers de logros (feature 008). `event` referencia un evento de dominio conocido.
export const ACHIEVEMENT_CATEGORIES = ['care', 'battle', 'ai', 'collection', 'social'] as const;
export type AchievementCategory = (typeof ACHIEVEMENT_CATEGORIES)[number];
export const ACHIEVEMENT_TIERS = ['common', 'rare', 'epic', 'legendary'] as const;
export type AchievementTier = (typeof ACHIEVEMENT_TIERS)[number];
export const ACHIEVEMENT_EVENTS = [
  'pet:fed', 'pet:cleaned', 'pet:slept', 'pet:evolved', 'pet:level_up',
  'egg:hatched', 'battle:finished', 'battle_win', 'minigame:finished',
  'chat:message_sent', 'social:constellation_shared', 'social:public_profile',
] as const;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color hex #RRGGBB');

const baseStatsSchema = z.object({
  hp: z.number().nonnegative(),
  atk: z.number().nonnegative(),
  def: z.number().nonnegative(),
  vel: z.number().nonnegative(),
  esp: z.number().nonnegative(),
});

const rarityEntrySchema = z.object({
  probability: z.number().min(0).max(1),
  multiplier: z.number().positive(),
});

const leagueSchema = z.object({ id: z.string(), name: z.string(), minElo: z.number().int() });
const rewardSchema = z.object({ xp: z.number(), coins: z.number(), happiness: z.number() });

/** balance.json */
export const balanceSchema = z
  .object({
    $schema: z.string().optional(),
    version: z.string(),
    rarity: z.record(z.string(), rarityEntrySchema),
    pity: z.object({
      superRareThreshold: z.number().int().nonnegative(),
      legendaryThreshold: z.number().int().nonnegative(),
    }),
    shinyProbability: z.number().min(0).max(1),
    vitals: z.object({
      max: z.number(),
      min: z.number(),
      cleanMaxHygiene: z.number(),
      decayPerHour: z.object({
        awake: z.record(z.string(), z.number()),
        sleeping: z.record(z.string(), z.number()),
      }),
      criticalThreshold: z.number(),
      sicknessHealthThreshold: z.number(),
    }),
    notifications: z
      .object({
        vitals: z.object({ criticalThreshold: z.number().nonnegative() }).optional(),
        quietHours: z
          .object({ start: z.number().int().min(0).max(23), end: z.number().int().min(0).max(23) })
          .optional(),
        rateLimit: z.object({ defaultMaxPerDay: z.number().int().nonnegative() }).optional(),
        dedup: z.object({ windowMinutes: z.number().int().nonnegative() }).optional(),
      })
      .optional(),
    leveling: z.object({
      maxLevel: z.number().int().positive(),
      stages: z.record(z.string(), z.number().int()),
    }),
    combats: z.object({
      dailyFreeBattles: z.number().int().positive(),
      energyCostPerBattle: z.number().positive(),
      minLevel: z.number().int().positive().optional(),
      maxRounds: z.number().int().positive(),
      hpMultiplier: z.number().positive(),
      damageScale: z.number().positive(),
      critChance: z.number().min(0).max(1),
      critMultiplier: z.number().positive(),
      elementAdvantage: z.number().positive(),
      elementDisadvantage: z.number().positive(),
      burnPctPerTurn: z.number().min(0).max(1),
      guardDefMultiplier: z.number().positive(),
      mood: z.object({
        minMultiplier: z.number().min(0).max(1),
        sickMultiplier: z.number().min(0).max(1),
      }),
      elo: z
        .object({
          initial: z.number(),
          k: z.number().positive(),
          floor: z.number(),
          window: z.number().positive(),
          maxWindow: z.number(),
          windowStep: z.number().positive(),
        })
        .refine((e) => e.maxWindow >= e.window, { message: 'elo.maxWindow debe ser >= elo.window' }),
      leagues: z.array(leagueSchema).min(2),
      rewards: z.object({
        win: rewardSchema,
        draw: rewardSchema,
        loss: rewardSchema,
        botMultiplier: z.number().optional(),
      }),
      weeklyPoints: z.object({ win: z.number(), draw: z.number(), loss: z.number() }),
    }),
    sleep: z.object({
      nightStartHour: z.number().int().min(0).max(23),
      nightEndHour: z.number().int().min(0).max(23),
      awakeNightEnergyMultiplier: z.number().optional(),
      sleepingNightEnergyBonus: z.number().optional(),
      sleepingNightHealthRegenPerHour: z.number().optional(),
    }),
    evolution: z.object({ finalStageItemId: z.string(), finalStageMinLevel: z.number().int() }),
    bonding: z
      .object({
        interactions: z.record(z.string(), z.number().nonnegative()),
        decayRatePerDay: z.number().nonnegative(),
        graceWindowHours: z.number().positive(),
        decayStartHours: z.number().positive(),
        tiers: z
          .array(z.object({ id: z.string(), name: z.string(), min: z.number().nonnegative() }))
          .min(1),
      })
      .optional(),
    minigames: z
      .object({
        sessionTtlSeconds: z.number().optional(),
        graceSeconds: z.number().optional(),
        cooldownSeconds: z.number().optional(),
        dailyRewardedSessions: z.number().optional(),
        games: z.record(z.string(), z.any()).optional(),
      })
      .passthrough(),
    chests: z.any().optional(),
    // R-04: topes de las lecturas públicas (límites de paginación/tamaño). Datos de juego,
    // no literales: los servicios los leen vía GameDataService.
    publicApi: z
      .object({
        leaderboardMax: z.number().int().positive(),
        eventsLimit: z.number().int().positive(),
        standings: z
          .object({
            defaultLimit: z.number().int().positive(),
            maxLimit: z.number().int().positive(),
          })
          .optional(),
      })
      .optional(),
  })
  .passthrough();

/** species.json (arreglo de especies) */
export const speciesSchema = z.array(
  z
    .object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      element: z.enum(ELEMENTS),
      rarity: z.string(),
      baseStats: baseStatsSchema,
      favoriteFood: z.string(),
      spriteKey: z.string(),
      defaultPalette: z.object({ primary: hexColor, secondary: hexColor, accent: hexColor }),
    })
    .passthrough(),
);

/** patterns.json */
export const patternsSchema = z.array(
  z
    .object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      minRarity: z.string(),
    })
    .passthrough(),
);

/** foods.json */
export const foodsSchema = z.array(
  z
    .object({
      id: z.string(),
      name: z.string(),
      kind: z.string(),
      description: z.string(),
      priceCoins: z.number(),
      priceGems: z.number(),
      effects: z.record(z.string(), z.union([z.number(), z.boolean()])),
    })
    .passthrough(),
);

/** skills.json */
export const skillsSchema = z.array(
  z
    .object({
      id: z.string(),
      name: z.string(),
      element: z.union([z.enum(ELEMENTS), z.literal('neutral')]),
      kind: z.enum(['attack', 'heal', 'guard']),
      power: z.number(),
      accuracy: z.number(),
      cooldown: z.number(),
      unlockLevel: z.number().int().positive(),
      priority: z.number().optional(),
      healPct: z.number().optional(),
      turns: z.number().optional(),
      description: z.string().optional(),
      inflicts: z
        .object({
          kind: z.enum(['burn', 'slow', 'sap', 'guard']),
          chance: z.number().min(0).max(1),
          turns: z.number(),
          value: z.number(),
        })
        .optional(),
    })
    .passthrough(),
);

/** missions.json */
const missionTypeSchema = z
  .object({
    type: z.string(),
    target: z.number(),
    weight: z.number(),
    description: z.string(),
    reward: z.record(z.string(), z.number()),
  })
  .passthrough();

export const missionsSchema = z
  .object({
    version: z.string().optional(),
    daily: z.object({
      minCount: z.number().int().nonnegative(),
      maxCount: z.number().int().nonnegative(),
      types: z.array(missionTypeSchema),
    }),
    weekly: z.object({
      minCount: z.number().int().nonnegative(),
      maxCount: z.number().int().nonnegative(),
      types: z.array(missionTypeSchema),
    }),
  })
  .passthrough();

/** achievements.json (feature 008): definiciones data-driven de logros. */
export const achievementsSchema = z.object({
  version: z.string(),
  achievements: z
    .array(
      z
        .object({
          id: z.string().min(1),
          name: z.string().min(1),
          desc: z.string().min(1),
          category: z.enum(ACHIEVEMENT_CATEGORIES),
          target: z.number().int().positive(),
          event: z.string().min(1),
          tier: z.enum(ACHIEVEMENT_TIERS),
          reward: z.object({
            coins: z.number().int().nonnegative(),
            gems: z.number().int().nonnegative(),
            xp: z.number().int().nonnegative(),
            itemId: z.string().nullable(),
          }),
        })
        .passthrough(),
    )
    .min(1),
});

/** constellations.json (feature 008): layout SVG de estrellas por categoría. */
export const constellationsSchema = z.object({
  version: z.string(),
  categories: z.record(
    z.enum(ACHIEVEMENT_CATEGORIES),
    z.object({
      name: z.string().min(1),
      stars: z.record(z.string(), z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })),
      connections: z.array(z.tuple([z.string(), z.string()])),
    }),
  ),
});
export const GAME_DATA_SCHEMAS: Record<GameDataFileKey, z.ZodType> = {
  balance: balanceSchema,
  species: speciesSchema,
  patterns: patternsSchema,
  foods: foodsSchema,
  skills: skillsSchema,
  missions: missionsSchema,
  achievements: achievementsSchema,
  constellations: constellationsSchema,
};

export interface FieldError {
  /** Ruta del campo inválido, por ejemplo `rarity.mythic.probability` (o `<root>`). */
  path: string;
  message: string;
}

/** Convierte un `ZodError` en una lista plana de errores con ruta y mensaje. */
export function toFieldErrors(error: z.ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.map((p) => String(p)).join('.') : '<root>',
    message: issue.message,
  }));
}

export interface FileValidationResult {
  ok: boolean;
  errors: FieldError[];
  /** Datos parseados (y, si aplica, refinados) cuando la validación es exitosa. */
  data?: unknown;
}

/** Valida un único archivo de game data contra su schema zod. */
export function validateFile(file: GameDataFileKey, data: unknown): FileValidationResult {
  const schema = GAME_DATA_SCHEMAS[file];
  const result = schema.safeParse(data);
  if (result.success) return { ok: true, errors: [], data: result.data };
  return { ok: false, errors: toFieldErrors(result.error) };
}

export interface GameDataBundle {
  balance: any;
  species: any[];
  patterns: any[];
  foods: any[];
  skills: any[];
  missions: any;
  achievements: any | null;
  constellations: any | null;
}

/**
 * Integridad cruzada entre los game-data (replica las reglas de `scripts/validate-game-data.js`).
 * Devuelve la lista de problemas humanos (vacía = todo válido). Se usa en el hot-reload (contra el
 * snapshot resultante de aplicar un archivo nuevo) y en el CLI `validate`.
 */
export function validateGameData(b: GameDataBundle): string[] {
  const errors: string[] = [];
  const { balance, species, patterns, foods, skills } = b;
  if (!balance || typeof balance !== 'object') return ['balance.json ausente o no es un objeto'];

  const rarities: Record<string, { probability?: number; multiplier?: number }> = balance.rarity ?? {};

  // 1. Probabilidades de rareza suman 1.0
  let totalProb = 0;
  for (const [key, val] of Object.entries(rarities)) {
    if (typeof val?.probability !== 'number' || typeof val?.multiplier !== 'number') {
      errors.push(`balance.rarity.${key} inválido (falta probability/multiplier)`);
      continue;
    }
    totalProb += val.probability;
  }
  if (Math.abs(totalProb - 1.0) > 0.0001) {
    errors.push(`Las probabilidades de rareza deben sumar 1.0 (suma actual: ${totalProb})`);
  }

  // 2. Secciones de sueño / evolución / minijuegos
  const sleep = balance.sleep;
  if (!sleep || sleep.nightStartHour < 0 || sleep.nightStartHour > 23 || sleep.nightEndHour < 0 || sleep.nightEndHour > 23) {
    errors.push('balance.sleep inválido: las horas deben estar entre 0 y 23');
  }
  const evo = balance.evolution;
  if (!evo || !(foods ?? []).some((f) => f.id === evo?.finalStageItemId && f.kind === 'evolution')) {
    errors.push('balance.evolution.finalStageItemId debe existir en foods.json con kind "evolution"');
  }
  const mg = balance.minigames;
  const mgGames: Record<string, any> = mg?.games ?? {};
  if (!mg || Object.keys(mgGames).length === 0) {
    errors.push('balance.minigames.games vacío o ausente');
  } else {
    for (const [id, g] of Object.entries(mgGames)) {
      for (const k of ['durationSeconds', 'minDurationSeconds', 'maxScorePerSecond', 'coinsPerPoint', 'maxCoins', 'xpPerPoint', 'maxXp', 'happiness']) {
        if (typeof g?.[k] !== 'number' || g[k] < 0) errors.push(`balance.minigames.games.${id}.${k} inválido`);
      }
      if (typeof g?.minDurationSeconds === 'number' && typeof g?.durationSeconds === 'number' && g.minDurationSeconds > g.durationSeconds) {
        errors.push(`minijuego ${id}: minDurationSeconds no puede superar durationSeconds`);
      }
    }
  }

  // 3. Combate
  const cb = balance.combats;
  if (!cb) {
    errors.push('balance.combats ausente');
  } else {
    for (const k of ['dailyFreeBattles', 'energyCostPerBattle', 'maxRounds', 'hpMultiplier', 'damageScale', 'critChance', 'critMultiplier', 'elementAdvantage', 'elementDisadvantage', 'burnPctPerTurn', 'guardDefMultiplier']) {
      if (typeof cb[k] !== 'number' || cb[k] <= 0) errors.push(`balance.combats.${k} inválido`);
    }
    if (!cb.elo || cb.elo.k <= 0 || cb.elo.window <= 0 || cb.elo.maxWindow < cb.elo.window) {
      errors.push('balance.combats.elo inválido');
    }
    if (!Array.isArray(cb.leagues) || cb.leagues.length < 2 || cb.leagues[0]?.minElo !== 0) {
      errors.push('balance.combats.leagues debe empezar en minElo 0');
    } else {
      for (let i = 1; i < cb.leagues.length; i++) {
        if (cb.leagues[i].minElo <= cb.leagues[i - 1].minElo) {
          errors.push('Las ligas deben estar ordenadas por minElo creciente');
          break;
        }
      }
    }
    for (const r of ['win', 'draw', 'loss']) {
      if (typeof cb.rewards?.[r]?.xp !== 'number' || typeof cb.rewards?.[r]?.coins !== 'number') {
        errors.push(`balance.combats.rewards.${r} inválido`);
      }
    }
  }

  // 4. Habilidades + elementos
  const skillIds = new Set<string>();
  const elements = new Set((species ?? []).map((s) => s.element));
  for (const sk of skills ?? []) {
    if (skillIds.has(sk.id)) errors.push(`Habilidad duplicada: ${sk.id}`);
    skillIds.add(sk.id);
    if (!['attack', 'heal', 'guard'].includes(sk.kind)) errors.push(`Habilidad ${sk.id}: kind inválido`);
    if (sk.element !== 'neutral' && !elements.has(sk.element)) errors.push(`Habilidad ${sk.id}: elemento sin especies (${sk.element})`);
    if (!(sk.accuracy > 0 && sk.accuracy <= 100) || sk.cooldown < 0 || sk.unlockLevel < 1) {
      errors.push(`Habilidad ${sk.id}: valores inválidos`);
    }
    if (sk.kind === 'attack' && !(sk.power > 0)) errors.push(`Habilidad ${sk.id}: un ataque necesita power`);
  }
  for (const el of elements) {
    if (!(skills ?? []).some((s) => s.element === el && s.unlockLevel === 1)) {
      errors.push(`El elemento ${el} no tiene habilidad de nivel 1`);
    }
  }
  if (!(skills ?? []).some((s) => s.id === 'tackle')) {
    errors.push('Falta la habilidad base "tackle"');
  }

  // 5. Comidas (ids únicos)
  const foodIds = new Set<string>();
  for (const f of foods ?? []) {
    if (foodIds.has(f.id)) {
      errors.push(`ID de alimento duplicado: ${f.id}`);
      break;
    }
    foodIds.add(f.id);
  }

  // 6. Especies (elemento, favoriteFood, rarity)
  for (const sp of species ?? []) {
    if (!ELEMENTS.includes(sp.element)) errors.push(`Elemento no reconocido '${sp.element}' en especie ${sp.id}`);
    if (!foodIds.has(sp.favoriteFood)) errors.push(`favoriteFood '${sp.favoriteFood}' en especie ${sp.id} no existe en foods.json`);
    if (!rarities[sp.rarity]) errors.push(`Rareza '${sp.rarity}' en especie ${sp.id} no está en balance.json`);
  }

  // 7. Patrones (minRarity)
  for (const pat of patterns ?? []) {
    if (!rarities[pat.minRarity]) errors.push(`minRarity '${pat.minRarity}' en patrón ${pat.id} no está en balance.json`);
  }

  // 8. Logros y constelaciones (feature 008): integridad cruzada
  const achievements = b.achievements;
  const constellations = b.constellations;
  if (achievements && typeof achievements === 'object') {
    const knownAchIds = new Set<string>();
    const achIds = new Set<string>();
    for (const a of (achievements as any).achievements ?? []) {
      if (achIds.has(a.id)) {
        errors.push(`Logro duplicado: ${a.id}`);
        break;
      }
      achIds.add(a.id);
      knownAchIds.add(a.id);
      if (!ACHIEVEMENT_EVENTS.includes(a.event as (typeof ACHIEVEMENT_EVENTS)[number])) {
        errors.push(`Logro ${a.id}: evento de dominio desconocido '${a.event}'`);
      }
      // Los logros epic/legendary pueden llevar item; los otros deben dejarlo nulo.
      if (a.reward?.itemId && !['epic', 'legendary'].includes(a.tier)) {
        errors.push(`Logro ${a.id}: solo epic/legendary pueden otorgar itemId`);
      }
    }

    if (constellations && typeof constellations === 'object') {
      for (const [cat, layout] of Object.entries((constellations as any).categories ?? {}) as [string, any][]) {
        const stars = (layout?.stars ?? {}) as Record<string, unknown>;
        for (const starId of Object.keys(stars)) {
          if (!knownAchIds.has(starId)) errors.push(`Constelación ${cat}: la estrella '${starId}' no existe en achievements.json`);
        }
        for (const [a, b2] of (layout?.connections ?? []) as [string, string][]) {
          if (stars[a] === undefined) errors.push(`Constelación ${cat}: conexión apunta a estrella inexistente '${a}'`);
          if (stars[b2] === undefined) errors.push(`Constelación ${cat}: conexión apunta a estrella inexistente '${b2}'`);
        }
      }
    }
  }

  return errors;
}