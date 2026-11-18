/**
 * Tipos compartidos del "cerebro" de un Pockai (spec 36). Todos los motores trabajan sobre el
 * mismo perfil de criatura (`CreatureProfile`), que se construye a partir de la fila `Pet`,
 * su especie y `balance.personality`.
 */

export const DIMENSIONS = ['curiosity', 'sociability', 'bravery', 'affection', 'temper'] as const;
export type Dimension = (typeof DIMENSIONS)[number];
export type Dims = Record<Dimension, number>;

export const MEMORY_LAYERS = ['episodic', 'semantic', 'emotional'] as const;
export type MemoryLayer = (typeof MEMORY_LAYERS)[number];

export type IntelligenceTier = 'chat' | 'memory' | 'agent';

export interface Band {
  /** Límite superior inclusivo de la banda (la primera empieza en 0, la última acaba en 100). */
  max: number;
  keyword: string;
  label: string;
  /** Frase que se inyecta en el prompt cuando la dimensión cae en esta banda. */
  prompt: string;
  /** La misma idea en primera persona («Hago preguntas…»); si falta, se usa `prompt`. */
  self?: string;
}

export interface PersonalityConfig {
  dimensions: Record<Dimension, { label: string; bands: Band[] }>;
  birth: { variance: number; defaultBias: number };
  evolution: {
    dailyCapPerDimension: number;
    elasticity: number;
    events: Record<string, Partial<Dims>>;
  };
  memory: {
    capacity: Record<IntelligenceTier, Record<MemoryLayer, number>>;
    planMultiplier: Record<string, number>;
    promptBudgetChars: Record<string, number>;
    recall: Record<MemoryLayer, number>;
    recencyHalfLifeDays: Record<MemoryLayer, number>;
    minImportanceToStore: number;
    /** Puntuación mínima para que un recuerdo entre en el prompt (lo casi olvidado y sin relación se queda fuera). */
    minRecallScore: number;
    /** Un recuerdo inyectado hace menos de estos minutos y sin relación con el mensaje pierde puntuación. */
    recentRecallMinutes: number;
    recentRecallPenalty: number;
    /** Un episodio que se repite (misma clave) gana esta importancia cada vez, hasta `repeatCap`. */
    repeatBoost: number;
    repeatCap: number;
  };
  autonomy: AutonomyConfig;
  combat: { maxThresholdShift: number };
  behavior: { minEnergyToPlay: number };
}

export interface AutonomyActivityConfig {
  base: number;
  weights: Partial<Dims>;
  energy: number;
  happiness: number;
}

export type AutonomyActivity = 'rest' | 'play_alone' | 'explore' | 'socialize' | 'wait_owner';

export interface AutonomyConfig {
  intervalMinutes: number;
  maxIntervalsPerCatchUp: number;
  ownerAwayMinutes: number;
  memorableChance: number;
  maxEpisodesPerCatchUp: number;
  minEnergyForActivity: number;
  dailyHappinessCap: number;
  dailyEnergyCap: number;
  activities: Record<AutonomyActivity, AutonomyActivityConfig>;
  itemFind: { chancePerExplore: number; curiosityBonusPerPoint: number; dailyCap: number; items: string[] };
  social: { batchSize: number; maxPairsPerSweep: number; encounterChance: number; dailyCapPerPet: number };
}

/** Estado de deriva diaria (topes de cambio por dimensión y día). */
export interface DriftState {
  day: string;
  used: Partial<Dims>;
}

/** Contadores diarios de la vida autónoma (topes de recompensas). */
export interface AutonomyDaily {
  day: string;
  items: number;
  happiness: number;
  energy: number;
  encounters: number;
}

/**
 * Contenido de `Pet.personality` (JSON). Las claves `trait`, `temperament` y `genes` son
 * anteriores a la spec 36 y se mantienen: `trait` y `temperament` se derivan de `dims`.
 */
export interface StoredPersonality {
  dims?: Dims;
  drift?: DriftState;
  autonomy?: AutonomyDaily;
  lastNeglectDay?: string;
  trait?: string;
  temperament?: string;
  genes?: unknown[];
  [k: string]: unknown;
}

export interface DimView {
  value: number;
  keyword: string;
  label: string;
}

/** Perfil único que comparten los cinco motores. */
export interface CreatureProfile {
  petId: string;
  userId: string;
  name: string;
  speciesId: string;
  element: string;
  dims: Dims;
  traits: Record<Dimension, DimView>;
  legacy: { trait: string; temperament: string };
  mood: string;
  bondingTier: string;
  intelligenceTier: IntelligenceTier;
  vitals: { hunger: number; happiness: number; energy: number; hygiene: number; health: number; sick: boolean; sleeping: boolean };
}
