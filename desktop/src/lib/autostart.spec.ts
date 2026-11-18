import { describe, expect, it } from 'vitest';
import { isAutostartEnabled, isAutostartSupported, setAutostart } from './autostart';

describe('autostart fuera de Tauri', () => {
  it('no está soportado ni activado', async () => {
    expect(isAutostartSupported()).toBe(false);
    await expect(isAutostartEnabled()).resolves.toBe(false);
  });

  it('cambiarlo no lanza', async () => {
    await expect(setAutostart(true)).resolves.toBeUndefined();
    await expect(setAutostart(false)).resolves.toBeUndefined();
  });
});
