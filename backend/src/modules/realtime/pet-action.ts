/**
 * Evento de socket `pet:action`: qué le acaba de pasar a la mascota, para que el cliente la anime
 * (comer, subir de nivel, ganar una pelea…). Va junto a `pet:update`, que solo lleva los datos.
 *
 * Mantener sincronizado con `desktop/src/lib/animation/petActions.ts`.
 */
export const PET_ACTIONS = [
  'fed',
  'cleaned',
  'slept',
  'woke',
  'healed',
  'level_up',
  'evolved',
  'hatched',
  'battle_won',
  'battle_lost',
  'battle_defended',
  'raid_attack',
  'tournament_win',
  'tournament_loss',
  'trained',
  'cooked',
  'adventure',
  'minigame_finished',
  'gift_received',
  'care_received',
  'chest_opened',
  'mission_completed',
  'achievement',
  'bonding_up',
  'bonding_down',
  'ritual_completed',
  'ritual_missed',
  'mood_moment',
  'buddy_play',
  'friend_visit',
  'welcome_back',
  'sick',
  'vitals_critical',
] as const;

export type PetAction = (typeof PET_ACTIONS)[number];

export interface PetActionEvent {
  /** Mascota afectada; `null` en eventos de la cuenta (logros, misiones, cofres): anima a la activa. */
  petId: string | null;
  action: PetAction;
  context?: Record<string, unknown>;
}
