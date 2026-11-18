import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { completeOnboarding, isOnboardingDone, onboardingDone, ONBOARDING_STORAGE_KEY, restartOnboarding } from './onboarding';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: (k: string) => {
      delete data[k];
    },
  };
}

describe('onboarding', () => {
  it('está pendiente la primera vez', () => {
    expect(isOnboardingDone(fakeStorage())).toBe(false);
  });

  it('se da por hecha si no se puede leer el almacenamiento', () => {
    const broken = {
      getItem: () => {
        throw new Error('bloqueado');
      },
    };
    expect(isOnboardingDone(broken)).toBe(true);
  });

  it('completar la guarda y reiniciar la vuelve a mostrar', () => {
    const storage = fakeStorage();
    completeOnboarding(storage);
    expect(storage.data[ONBOARDING_STORAGE_KEY]).toBe('1');
    expect(isOnboardingDone(storage)).toBe(true);
    expect(get(onboardingDone)).toBe(true);

    restartOnboarding(storage);
    expect(isOnboardingDone(storage)).toBe(false);
    expect(get(onboardingDone)).toBe(false);
  });
});
