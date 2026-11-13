export type StatKey = 'hp' | 'atk' | 'def' | 'vel' | 'esp';
export const STAT_KEYS: StatKey[] = ['hp', 'atk', 'def', 'vel', 'esp'];
export type Stats = Record<StatKey, number>;

export type Element = 'fire' | 'water' | 'plant' | 'electric' | 'shadow' | 'light';
export type Strategy = 'aggressive' | 'defensive' | 'balanced';
export type StatusKind = 'burn' | 'slow' | 'sap' | 'guard';

export interface SkillDef {
  id: string;
  name: string;
  element: Element | 'neutral';
  kind: 'attack' | 'heal' | 'guard';
  power: number;
  accuracy: number;
  cooldown: number;
  unlockLevel: number;
  priority?: number;
  healPct?: number;
  turns?: number;
  description?: string;
  inflicts?: { kind: StatusKind; chance: number; turns: number; value: number };
}

/** Parte del balance.json que usa el motor. */
export interface CombatConfig {
  maxRounds: number;
  hpMultiplier: number;
  damageScale: number;
  critChance: number;
  critMultiplier: number;
  elementAdvantage: number;
  elementDisadvantage: number;
  burnPctPerTurn: number;
  guardDefMultiplier: number;
  mood: { minMultiplier: number; sickMultiplier: number };
}

/** Luchador ya resuelto (instantánea): el combate no vuelve a leer la base de datos. */
export interface Fighter {
  name: string;
  speciesId: string;
  element: Element;
  level: number;
  /** Estadísticas efectivas (nivel, rareza y puntos repartidos ya aplicados). */
  stats: Stats;
  /** Multiplicador de rendimiento por ánimo y salud (0.8–1.0). */
  mood: number;
  skills: SkillDef[];
  strategy: Strategy;
  isBot: boolean;
  petId?: string;
  ownerId?: string;
}

export interface ParticipantLog {
  name: string;
  speciesId: string;
  element: Element;
  level: number;
  stats: Stats;
  mood: number;
  maxHp: number;
  skills: string[];
  strategy: Strategy;
  isBot: boolean;
  petId?: string;
}

export type BattleEvent =
  | { t: 'round'; n: number }
  | {
      t: 'move';
      actor: 0 | 1;
      skill: string;
      hit: boolean;
      crit?: boolean;
      mult?: number;
      damage?: number;
      hp: [number, number];
    }
  | { t: 'heal'; actor: 0 | 1; skill: string; amount: number; hp: [number, number] }
  | { t: 'guard'; actor: 0 | 1; skill: string; turns: number }
  | { t: 'status'; target: 0 | 1; kind: StatusKind; turns: number }
  | { t: 'dot'; target: 0 | 1; kind: 'burn'; damage: number; hp: [number, number] }
  | { t: 'faint'; actor: 0 | 1 }
  | { t: 'end'; winner: 0 | 1 | null; reason: 'faint' | 'rounds'; rounds: number; hp: [number, number] };

export interface BattleLog {
  version: 1;
  seed: number;
  participants: [ParticipantLog, ParticipantLog];
  events: BattleEvent[];
}

export interface BattleResult {
  log: BattleLog;
  /** 0 = atacante, 1 = defensor, null = empate. */
  winner: 0 | 1 | null;
  rounds: number;
  finalHp: [number, number];
}
