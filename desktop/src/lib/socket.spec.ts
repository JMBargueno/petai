import { beforeEach, describe, expect, it } from 'vitest';

/**
 * `socket.ts` importa `api.ts`, que lee `localStorage` a nivel de módulo. Por eso se define
 * un global de `localStorage` (y `window`) ANTES del import dinámico de `socket`.
 */
const store = new Map<string, string>();
const localStorageMock = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
};
Object.assign(globalThis, {
  localStorage: localStorageMock,
  window: { localStorage: localStorageMock, location: { origin: 'http://localhost:1420' } },
});

const { getDeviceId } = await import('./socket');

const DEVICE_ID_KEY = 'petai.deviceId';

describe('getDeviceId', () => {
  beforeEach(() => {
    store.delete(DEVICE_ID_KEY);
  });

  it('genera un id y lo persiste en localStorage cuando no hay uno', () => {
    const first = getDeviceId();
    expect(typeof first).toBe('string');
    expect(first.length).toBeGreaterThan(0);
    expect(localStorageMock.getItem(DEVICE_ID_KEY)).toBe(first);
  });

  it('es estable entre llamadas: devuelve el id persistido', () => {
    const first = getDeviceId();
    const second = getDeviceId();
    expect(second).toBe(first);
  });

  it('respeta un id ya presente en localStorage', () => {
    localStorageMock.setItem(DEVICE_ID_KEY, 'device-preexistente');
    expect(getDeviceId()).toBe('device-preexistente');
  });

  it('funciona sin window (SSR/pruebas) devolviendo un id generado', () => {
    const win = globalThis.window;
    delete (globalThis as Record<string, unknown>).window;
    try {
      const id = getDeviceId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    } finally {
      globalThis.window = win;
    }
  });
});