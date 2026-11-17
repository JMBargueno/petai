import { get } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MAINTENANCE_MESSAGE,
  checkMaintenance,
  enterMaintenance,
  inspectMaintenance,
  maintenanceLock,
  resetMaintenance,
} from './maintenance';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('mantenimiento (escritorio)', () => {
  afterEach(() => resetMaintenance());

  it('un 503 MAINTENANCE bloquea la app con el mensaje en castellano', async () => {
    const res = json({ statusCode: 503, code: 'MAINTENANCE', message: 'x', messages: { es: 'Volvemos a las 18:00', en: 'Back at 6pm' } }, 503);
    expect(await inspectMaintenance(res)).toBe(true);
    expect(get(maintenanceLock)).toBe('Volvemos a las 18:00');
    // El cuerpo original sigue legible para quien hizo la petición.
    expect((await res.json()).code).toBe('MAINTENANCE');
  });

  it('otros errores no bloquean', async () => {
    expect(await inspectMaintenance(json({ message: 'caído' }, 503))).toBe(false);
    expect(await inspectMaintenance(json({ code: 'MAINTENANCE' }, 500))).toBe(false);
    expect(get(maintenanceLock)).toBeNull();
  });

  it('sin mensaje: texto por defecto', () => {
    enterMaintenance({ code: 'MAINTENANCE' });
    expect(get(maintenanceLock)).toBe(DEFAULT_MAINTENANCE_MESSAGE);
  });

  it('la comprobación levanta el bloqueo si el mantenimiento terminó o solo afecta a la web', async () => {
    enterMaintenance({ messages: { es: 'Hola' } });
    const fetcher = vi.fn().mockResolvedValue(json({ maintenance: { enabled: true, scope: 'web', message: { es: null } } }));
    expect(await checkMaintenance(fetcher)).toBe(false);
    expect(get(maintenanceLock)).toBeNull();
    const [, init] = fetcher.mock.calls[0];
    expect(init.headers['X-Client']).toBe('desktop');
  });

  it('si sigue activo para las apps, se mantiene (y actualiza el mensaje)', async () => {
    enterMaintenance({ messages: { es: 'Antes' } });
    const fetcher = vi.fn().mockResolvedValue(json({ maintenance: { enabled: true, scope: 'all', message: { es: 'Ahora' } } }));
    expect(await checkMaintenance(fetcher)).toBe(true);
    expect(get(maintenanceLock)).toBe('Ahora');
  });

  it('sin conexión: se queda como estaba', async () => {
    enterMaintenance({});
    const fetcher = vi.fn().mockRejectedValue(new TypeError('offline'));
    expect(await checkMaintenance(fetcher)).toBe(true);
    expect(get(maintenanceLock)).not.toBeNull();
  });
});
