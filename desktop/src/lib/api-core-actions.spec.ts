import { beforeEach, describe, expect, it, vi } from 'vitest';

// Dentro de la app (con núcleo) las acciones del jugador no describen peticiones HTTP: se le piden
// al núcleo con su tipo. Aquí se simula ese núcleo.
// Núcleo simulado: apunta lo que se le pide y responde o rechaza según el test.
const core = vi.hoisted(() => ({ calls: [] as unknown[], result: null as unknown, failure: null as unknown }));
const perform = (action: unknown) => {
  core.calls.push(action);
  return core.failure ? Promise.reject(core.failure) : Promise.resolve(core.result);
};
vi.mock('@pockai/client', () => ({
  hasCore: () => true,
  perform: (action: unknown) => perform(action),
  coreFetch: vi.fn(),
  coreStream: vi.fn(),
  importLegacySession: vi.fn(),
  logout: vi.fn(async () => {}),
  onMaintenance: vi.fn(async () => () => {}),
  onSession: vi.fn(async () => () => {}),
  sessionState: vi.fn(async () => ({ active: true })),
}));

import { ApiError, api, isTerminalError } from './api';

describe('acciones del jugador a través del núcleo', () => {
  beforeEach(() => {
    core.calls = [];
    core.result = null;
    core.failure = null;
  });

  it('piden la acción con su tipo, sin rutas ni cuerpos', async () => {
    core.result = { id: 'p1', hunger: 100 };

    const pet = await api.feedPet('p1', 'apple');
    await api.cleanPet('p1');
    await api.setPetInHabitat('p1', true);
    await api.hatchEgg('e1');
    await api.hatchEgg('e2', 'Brote');
    await api.buyShopItem('apple');
    await api.buyEgg();

    expect(pet).toEqual({ id: 'p1', hunger: 100 });
    expect(core.calls).toEqual([
      { type: 'feed', petId: 'p1', itemId: 'apple' },
      { type: 'clean', petId: 'p1' },
      { type: 'setInHabitat', petId: 'p1', inHabitat: true },
      { type: 'hatchEgg', eggId: 'e1', nickname: null },
      { type: 'hatchEgg', eggId: 'e2', nickname: 'Brote' },
      { type: 'buyItem', itemId: 'apple', quantity: 1 },
      { type: 'buyEgg' },
    ]);
  });

  it('un rechazo del servidor llega como ApiError con su mensaje y su estado', async () => {
    core.failure = { status: 400, message: 'No tienes ese objeto' };

    const error = await api.feedPet('p1', 'nada').catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toBe('No tienes ese objeto');
    expect(error.status).toBe(400);
    // Es culpa de la acción, no del entorno: lo dice la mascota, no un aviso del panel.
    expect(isTerminalError(error)).toBe(false);
  });

  it('si el servidor no da mensaje se usa el de la acción', async () => {
    core.failure = { status: 500, message: '' };

    const error = await api.sleepPet('p1').catch((e) => e);

    expect(error.message).toBe('Error al dormir');
    expect(isTerminalError(error)).toBe(true);
  });

  it('sin conexión el error es del entorno', async () => {
    core.failure = { status: null, message: '' };

    const error = await api.wakePet('p1').catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toContain('Sin conexión');
    expect(isTerminalError(error)).toBe(true);
  });
});
