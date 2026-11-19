/**
 * @pockai/minigames: minijuegos compartidos por escritorio, Android e iOS (spec 39).
 * El backend importa solo `@pockai/minigames/logic` (sin DOM).
 */
export * from './logic';
export { MINIGAMES, getMinigame, isSupportedMinigame, type MinigameEntry } from './registry';
export { mountMinigame, MAX_PAUSE_MS, type MountOptions, type MountedMinigame } from './host';
export * from './protocol';
export { sheetFromAssetBase, DEFAULT_PET, type PetActor, type PetSheetResolver, type PetSheetUrls } from './pet';
export { pieceUrl, backdropUrl, itemUrl } from './assets';
export { MG, minigameSoundIds, type MinigameSound, type SoundOptions } from './sound';
export { catchFood, CATCH_FOOD } from './games/catchFood';
export { memoryMatch, MEMORY_MATCH } from './games/memoryMatch';
export { reflex, REFLEX } from './games/reflex';
export { pulsoVoltaico } from './games/pulsoVoltaico';
export { corrienteDatos } from './games/corrienteDatos';
export { raizFractal } from './games/raizFractal';
export { cifrado } from './games/cifrado';
export { faroClaridad } from './games/faroClaridad';
export { forjaTermica } from './games/forjaTermica';
