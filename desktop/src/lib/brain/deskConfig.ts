/**
 * Configuración del cerebro del escritorio. Los números viven en
 * `shared/game-data/balance.json → personality.desktop` (los valida `scripts/validate-game-data.js`);
 * aquí solo están sus tipos y la carga.
 */
import type { Dims, UtilityConfig } from '@pockai/mind';
import balance from '@shared/game-data/balance.json';

export type CursorRequirement = 'near' | 'still' | 'fast' | 'slow' | 'approaching';

export interface BehaviorRequires {
  minEnergy?: number;
  maxEnergy?: number;
  minHappiness?: number;
  /** Habilidad de escritorio que debe estar activa. */
  skill?: string;
  cursor?: CursorRequirement;
  userActive?: boolean;
  typing?: boolean;
  /** Necesita movimiento: no se ofrece con «reducir movimiento». */
  motion?: boolean;
  /** Solo al estrenar un tramo del día. */
  newTimeSlot?: boolean;
  /** Hay una ventana en primer plano sobre la que posarse. */
  window?: boolean;
  apps?: string[];
  moods?: string[];
  minDims?: Partial<Dims>;
  maxDims?: Partial<Dims>;
}

export interface BehaviorBoost {
  lowEnergy?: number;
  highEnergy?: number;
  lowHappiness?: number;
  highHappiness?: number;
}

export interface BehaviorConfig {
  base: number;
  weights?: Partial<Dims>;
  cooldownMs?: number;
  requires?: BehaviorRequires;
  boost?: BehaviorBoost;
}

export interface AppProfile {
  /** 0 = no habla; 1 = habla con normalidad. */
  barkFactor: number;
  /** Multiplicador por conducta mientras esa app está en foco (0 la descarta). */
  factors: Record<string, number>;
}

export interface DeskConfig {
  thinkMs: number;
  pauseMs: [number, number];
  antiRepeat: UtilityConfig;
  needs: { low: number; high: number };
  speeds: { slow: number; walk: number; run: number; climb: number };
  idle: {
    napAfterMs: number;
    welcomeMinAwayMs: number;
    longAwayMs: number;
    typingStillMs: number;
    typingRecentMs: number;
    /** Sin inactividad del sistema se deduce del cursor, con el umbral multiplicado por esto. */
    cursorOnlyFactor: number;
  };
  cursor: {
    nearPx: number;
    stalkMinPx: number;
    stalkMaxPx: number;
    stillMs: number;
    fastPxPerS: number;
    slowPxPerS: number;
    shyPx: number;
    followGapPx: number;
    catchPx: number;
  };
  barks: { everyMs: number };
  perch: { stayMs: [number, number]; hopCooldownMs: number };
  /** Conductas admitidas durante el trabajo de un Pomodoro. */
  focus: string[];
  appProfiles: Record<string, AppProfile>;
  behaviors: Record<string, BehaviorConfig>;
}

export const DESK_CONFIG = (balance as unknown as { personality: { desktop: DeskConfig } }).personality.desktop;

export const BIRTH_CONFIG = (balance as unknown as { personality: { birth: { variance: number; defaultBias: number } } })
  .personality.birth;
