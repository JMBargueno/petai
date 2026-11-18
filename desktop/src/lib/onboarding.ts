import { writable } from 'svelte/store';

/**
 * Guía de primer uso del panel. Se muestra una vez (la primera vez que hay mascota) y se
 * recuerda en localStorage; desde Ajustes › Acerca de se puede volver a ver.
 */
export const ONBOARDING_STORAGE_KEY = 'pockai_onboarding_done';

type ReadStorage = Pick<Storage, 'getItem'>;
type WriteStorage = Pick<Storage, 'setItem' | 'removeItem'>;

function defaultStorage(): Storage | undefined {
  return typeof localStorage !== 'undefined' ? localStorage : undefined;
}

export function isOnboardingDone(storage: ReadStorage | undefined = defaultStorage()): boolean {
  try {
    return storage?.getItem(ONBOARDING_STORAGE_KEY) === '1';
  } catch {
    // Sin almacenamiento no se podría recordar: mejor no mostrarla en cada arranque.
    return true;
  }
}

export const onboardingDone = writable<boolean>(isOnboardingDone());

export function completeOnboarding(storage: WriteStorage | undefined = defaultStorage()) {
  onboardingDone.set(true);
  try {
    storage?.setItem(ONBOARDING_STORAGE_KEY, '1');
  } catch {
    /* almacenamiento indisponible */
  }
}

export function restartOnboarding(storage: WriteStorage | undefined = defaultStorage()) {
  onboardingDone.set(false);
  try {
    storage?.removeItem(ONBOARDING_STORAGE_KEY);
  } catch {
    /* almacenamiento indisponible */
  }
}
