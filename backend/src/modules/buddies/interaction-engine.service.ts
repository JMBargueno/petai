import { Injectable } from '@nestjs/common';

export type BuddyInteractionType =
  | 'chase'
  | 'sleep_together'
  | 'play_fight'
  | 'eat_together'
  | 'idle_chat'
  | 'watch_together';

export interface BuddyEffect {
  happiness?: number;
  bonding?: number;
  energy?: number;
  note?: string;
}

/**
 * Motor puro de interacciones entre buddies. No toca la BD: recibe el azar (para tests
 * determinísticos), rola el tipo de interacción según la distribución ponderada del spec
 * (feature 029, AC2) y produce los efectos a aplicar a ambos pets.
 */
@Injectable()
export class InteractionEngineService {
  /** Cooldown: máx 3 interacciones buddy en 5 minutos (AC4). */
  readonly COOLDOWN_MS = 5 * 60 * 1000;
  readonly COOLDOWN_MAX = 3;
  /** Cap diario de interacciones buddy que otorgan bonding (AC3). */
  readonly DAILY_BONDING_CAP = 5;
  readonly DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

  /** Distribución ponderada del spec (suman 65%; el resto = "sin interacción" en ese tick). */
  private readonly weights: { type: BuddyInteractionType; prob: number }[] = [
    { type: 'chase', prob: 0.12 },
    { type: 'sleep_together', prob: 0.08 },
    { type: 'play_fight', prob: 0.10 },
    { type: 'eat_together', prob: 0.10 },
    { type: 'idle_chat', prob: 0.15 },
    { type: 'watch_together', prob: 0.10 },
  ];

  /**
   * Rola una interacción. `rand` (0..1) inyectable para tests. `state` permite filtrar
   * interacciones no aplicables (p. ej. sleep_together solo si ambos cansados).
   */
  rollInteraction(
    rand: () => number = Math.random,
    state: { bothTired: boolean; environmentalActive: boolean } = { bothTired: false, environmentalActive: false },
  ): BuddyInteractionType | null {
    const roll = rand();
    let acc = 0;
    for (const { type, prob } of this.weights) {
      acc += prob;
      if (roll < acc) {
        if (type === 'sleep_together' && !state.bothTired) return 'idle_chat';
        if (type === 'watch_together' && !state.environmentalActive) return 'idle_chat';
        return type;
      }
    }
    return null; // fuera del rango: este tick no hay interacción
  }

  effectsFor(type: BuddyInteractionType): BuddyEffect {
    switch (type) {
      case 'chase':
        return { happiness: 2, bonding: 1, note: '¡Espera!' };
      case 'play_fight':
        return { happiness: 5, bonding: 1, note: '¡Jajá!' };
      case 'eat_together':
        return { happiness: 2, bonding: 1, note: '¡Mía también!' };
      case 'idle_chat':
        return { happiness: 1, bonding: 1, note: '...' };
      case 'watch_together':
        return { happiness: 1, bonding: 1, note: '¡Mira!' };
      case 'sleep_together':
        return { energy: 5, bonding: 1, note: 'Zzz... juntos...' };
    }
  }

  durationFor(type: BuddyInteractionType): number {
    switch (type) {
      case 'chase':
        return 4; // 3-5s
      case 'play_fight':
        return 5;
      case 'eat_together':
        return 3;
      case 'idle_chat':
        return 4;
      case 'watch_together':
        return 3;
      case 'sleep_together':
        return 6;
    }
  }
}
