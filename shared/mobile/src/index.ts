/**
 * La app móvil de Pockai, compartida por Android e iOS: el shell con su navegación, el reflejo del
 * núcleo y los contenedores de cada pantalla. Aquí no hay lógica de juego ni llamadas al backend: el
 * estado se refleja desde el núcleo (Rust) y lo que el jugador hace se le pide con una acción
 * tipada.
 *
 * Una app (`apps/android`, `apps/ios`) es la cáscara: su `index.html`, su Vite, sus estilos propios y
 * una `MobileConfig`. Todo lo demás vive aquí, para que las dos no se separen.
 */
export { default as MobileApp } from './MobileApp.svelte';
export { startMobileApp } from './bootstrap';
export {
  DEFAULT_SECTIONS,
  DEFAULT_TABS,
  mobileConfig,
  type MobileConfig,
  type MobilePlatform,
  type MobileSection,
  type MobileSections,
  type MobileTab,
  type TabId,
} from './config';
export {
  act,
  activePet,
  authApi,
  failureText,
  hasCore,
  lock,
  offline,
  phase,
  redeemCode,
  reload,
  signOut,
  start,
  state,
  type Phase,
} from './core';
export { audioSettings, installSound, previewSound, updateAudioSettings, AUDIO_STORAGE_KEY } from './audio';
export { askNotificationsOnce } from './notifications';
