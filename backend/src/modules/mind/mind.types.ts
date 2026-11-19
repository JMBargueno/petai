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
    /** Episodios sin contar que se garantizan en el primer turno tras una ausencia (spec 37 §6.6). */
    sinceLastMax?: number;
    /**
     * Por debajo del nivel de memoria, cada cuántos mensajes del entrenador se extraen recuerdos
     * (más espaciado que la cadencia del plan). 0 = no se extrae hasta alcanzar ese nivel.
     */
    earlyExtractEvery: number;
  };
  autonomy: AutonomyConfig;
  /** Estado de ánimo de corto plazo (`@pockai/mind` → feeling). */
  feeling?: import('@pockai/mind/node').FeelingConfig;
  /** Progresión de inteligencia (spec 37 §3.4). */
  intelligence?: { /** Puntos de inteligencia que el chat puede dar en un día. */ dailyChatCap: number };
  social: import('./social.engine').SocialConfig;
  tricks: import('./tricks.engine').TricksConfig;
  wishes: import('./wishes.engine').WishesConfig;
  combat: { maxThresholdShift: number };
  behavior: BehaviorConfig;
}

/** Quién puede recibir una reacción. */
export type ReactionAudience = 'owner' | 'visitor' | 'pockai';

export interface ReactionEntry {
  /** Id de la reacción (del catálogo). */
  behavior: string;
  /** Peso con una personalidad neutra. */
  base: number;
  /** Cuánto mueve el peso cada punto de dimensión por encima o por debajo de 50. */
  weights?: Partial<Dims>;
  /** Término no lineal: `scale × Π(dim/100) × Π(1 − inverse/100)`. */
  product?: { scale: number; dims?: Dimension[]; inverse?: Dimension[] };
}

export interface BehaviorCatalogEntry {
  audiences: ReactionAudience[];
  /** Reacción activa: no sale enferma ni sin energía. */
  active?: boolean;
  /** Mínimos de personalidad para que sea coherente; si no se cumplen se usa `fallback`. */
  minDims?: Partial<Dims>;
  fallback?: string;
  reason?: string;
  /** Condición de la situación para que tenga sentido (tiene algo que contar, sabe un truco…). */
  when?: ReactionCondition;
}

/** Condiciones que una reacción puede exigir. Lista cerrada: se calculan en la pizarra de situación. */
export type ReactionCondition = 'has_find' | 'untold' | 'first_turn_today' | 'after_scold' | 'knows_trick';

export interface BehaviorConfig {
  minEnergyToPlay: number;
  antiRepeat?: {
    /** Cuántas reacciones recientes se recuerdan. */
    window: number;
    /** Factor (0-1) por cada aparición de la reacción en la ventana. */
    penalty: number;
    /** Margen relativo que otra reacción debe superar para sustituir a la última. */
    margin: number;
  };
  catalog?: Record<string, BehaviorCatalogEntry>;
  reactions?: Record<string, ReactionEntry[]>;
}

export interface AutonomyActivityConfig {
  base: number;
  weights: Partial<Dims>;
  energy: number;
  happiness: number;
}

export type AutonomyActivity = 'rest' | 'play_alone' | 'explore' | 'socialize' | 'wait_owner' | ExtraActivity;

/** Actividades añadidas por la spec 37 §4.6. Solo entran si están en la configuración y vienen a cuento. */
export type ExtraActivity = 'practice_trick' | 'tidy_habitat';

export interface AutonomyConfig {
  intervalMinutes: number;
  maxIntervalsPerCatchUp: number;
  ownerAwayMinutes: number;
  memorableChance: number;
  maxEpisodesPerCatchUp: number;
  minEnergyForActivity: number;
  dailyHappinessCap: number;
  dailyEnergyCap: number;
  activities: Record<Exclude<AutonomyActivity, ExtraActivity>, AutonomyActivityConfig> & Partial<Record<ExtraActivity, AutonomyActivityConfig>>;
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
  /** Últimas reacciones del chat (spec 37 §4.4), la más reciente al final. */
  recent?: string[];
  /** Trucos aprendidos y en curso (spec 37 §4.6); ver tricks.engine. */
  tricks?: unknown;
  /** Reloj de turnos y enfriamiento de los deseos (spec 37 §4.5); ver wishes.engine. */
  wishes?: unknown;
  /** Último día en que una disculpa del entrenador reparó la relación (una vez al día). */
  apologyDay?: string;
  /** Ánimo de corto plazo: lo que le acaba de pasar (`@pockai/mind` → feeling). */
  feeling?: { valence: number; arousal: number; at: number };
  /** Último turno de chat con su entrenador (ISO). Con él se sabe cuál es el primero tras una ausencia. */
  lastChatAt?: string;
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
  /** Últimas reacciones del chat guardadas (sin validar: puede traer ids de otra versión). */
  recent: string[];
  /** JSON de personalidad tal como está guardado (trucos, deseos…). Nunca se devuelve por la API. */
  stored: StoredPersonality;
  traits: Record<Dimension, DimView>;
  legacy: { trait: string; temperament: string };
  mood: string;
  /** Ánimo de corto plazo, ya asentado a este momento. `null` si no está configurado. */
  feeling: { label: string; valence: number; arousal: number } | null;
  bondingTier: string;
  intelligenceTier: IntelligenceTier;
  vitals: { hunger: number; happiness: number; energy: number; hygiene: number; health: number; sick: boolean; sleeping: boolean };
}
