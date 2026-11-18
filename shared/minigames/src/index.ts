/**
 * @pockai/minigames: minijuegos compartidos por escritorio, Android e iOS (spec 39).
 */
export { createRng, shuffle } from './core/rng';
export { createRunner, replay, type Runner } from './core/runner';
export * from './core/types';
export { MINIGAMES, getMinigame, isSupportedMinigame, type MinigameEntry } from './registry';
export { mountMinigame, type MountOptions, type MountedMinigame } from './host';
export * from './protocol';
export { catchFood, CATCH_FOOD } from './games/catchFood';
export { memoryMatch, MEMORY_MATCH } from './games/memoryMatch';
export { reflex, REFLEX } from './games/reflex';
