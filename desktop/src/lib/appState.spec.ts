import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

// Almacenamiento mínimo en memoria (los specs corren en Node).
const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
});

/** Núcleo simulado: guarda el suscriptor de cambios para poder emitirlos desde el test. */
const core = vi.hoisted(() => ({
  present: false,
  emit: (_change: unknown) => {},
  snapshot: { rev: 0, user: null, pets: [], activePetId: null, eggs: [], inventory: [], shop: [] } as any,
  stateLoad: vi.fn(),
  stateRefresh: vi.fn(async () => {}),
  stateApplyPet: vi.fn(async () => {}),
  statePatchPet: vi.fn(async () => {}),
  stateSelectPet: vi.fn(async () => {}),
}));
vi.mock('@pockai/client', () => ({
  hasCore: () => core.present,
  coreFetch: vi.fn(),
  onStateChange: async (cb: (change: unknown) => void) => {
    core.emit = cb;
    return () => {};
  },
  stateSnapshot: async () => core.snapshot,
  inboxPush: vi.fn(async () => {}),
  inboxTake: vi.fn(async () => []),
  inboxMarkAllRead: vi.fn(async () => {}),
  stateLoad: core.stateLoad,
  stateRefresh: core.stateRefresh,
  stateApplyPet: core.stateApplyPet,
  statePatchPet: core.statePatchPet,
  stateSelectPet: core.stateSelectPet,
}));

const api = vi.hoisted(() => ({
  getCatalog: vi.fn(),
  getMe: vi.fn(),
  updateMe: vi.fn(),
  getPets: vi.fn(),
  getEggs: vi.fn(),
  getInventory: vi.fn(),
  activatePet: vi.fn(async () => ({})),
}));
const session = vi.hoisted(() => ({ token: 'token' as string | null }));
vi.mock('./api', () => ({ api, getAccessToken: () => session.token, sessionReady: async () => {} }));

import * as appState from './appState';

const PETS = [{ id: 'p1', hunger: 80 }, { id: 'p2', hunger: 50 }];

beforeEach(() => {
  storage.clear();
  appState.resetAppState();
  core.present = false;
  core.snapshot = { rev: 0, user: null, pets: [], activePetId: null, eggs: [], inventory: [], shop: [] };
  session.token = 'token';
  vi.clearAllMocks();
  api.getCatalog.mockResolvedValue({ foods: [{ id: 'manzana' }, { id: 'reliquia', availability: 'drop' }] });
  api.getMe.mockResolvedValue({ id: 'u1', emailVerified: true, handle: 'filo', timezone: 'Europe/Madrid' });
  api.getPets.mockResolvedValue(PETS);
  api.getEggs.mockResolvedValue([{ id: 'e1' }]);
  api.getInventory.mockResolvedValue([{ itemId: 'manzana', quantity: 2 }]);
});

describe('appState sin núcleo (navegador y demo)', () => {
  it('carga el estado de una cuenta normal', async () => {
    const result = await appState.load();

    expect(result).toEqual({ session: true, lock: null, offline: false });
    expect(get(appState.user).handle).toBe('filo');
    expect(get(appState.pets)).toHaveLength(2);
    expect(get(appState.shopItems)).toEqual([{ id: 'manzana' }]);
    // Sin elección guardada, la activa es la primera y no se le impone al servidor.
    expect(get(appState.currentPet).id).toBe('p1');
    expect(api.activatePet).not.toHaveBeenCalled();
  });

  it('sin sesión solo carga la tienda', async () => {
    session.token = null;
    const result = await appState.load();
    expect(result.session).toBe(false);
    expect(api.getMe).not.toHaveBeenCalled();
    expect(get(appState.shopItems)).toHaveLength(1);
  });

  it('una cuenta sin verificar o sin nickname no carga el juego', async () => {
    api.getMe.mockResolvedValue({ id: 'u1', emailVerified: false });
    expect((await appState.load()).lock).toBe('unverified');
    api.getMe.mockResolvedValue({ id: 'u1', emailVerified: true, handle: null });
    expect((await appState.load()).lock).toBe('noHandle');
    expect(api.getPets).not.toHaveBeenCalled();
  });

  it('si el servidor no responde no hay sesión visible', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    api.getMe.mockRejectedValue(new Error('sin conexión'));
    const result = await appState.load();
    expect(result).toEqual({ session: false, lock: null, offline: true });
    expect(get(appState.user)).toBeNull();
    warn.mockRestore();
  });

  it('elegir mascota la recuerda en este equipo y se lo dice al servidor', async () => {
    await appState.load();

    expect(appState.selectPet('p2')).toBe(true);
    expect(appState.selectPet('p2')).toBe(false);
    expect(appState.selectPet('no-existe')).toBe(false);

    expect(get(appState.currentPet).id).toBe('p2');
    expect(storage.get('pockai_active_pet')).toBe('p2');
    expect(api.activatePet).toHaveBeenCalledTimes(1);
    expect(api.activatePet).toHaveBeenCalledWith('p2');
  });

  it('al arrancar respeta la elección guardada', async () => {
    storage.set('pockai_active_pet', 'p2');
    await appState.load();
    expect(get(appState.currentPet).id).toBe('p2');
    expect(api.activatePet).toHaveBeenCalledWith('p2');
  });

  it('aplica las mascotas que devuelve el servidor y los cambios sueltos', async () => {
    await appState.load();

    appState.applyPet({ id: 'p1', hunger: 100 }, false);
    appState.applyPet({ id: 'ajena' }, false);
    appState.applyPet({ id: 'p3' });
    appState.patchActivePet({ stage: 'teen' });

    const pets = get(appState.pets);
    expect(pets.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(pets[0]).toEqual({ id: 'p1', hunger: 100, stage: 'teen' });
  });

  it('el tiempo real y el sondeo avisan de una lectura fresca', async () => {
    await appState.load();
    const fresh = vi.fn();
    appState.onServerPets(fresh);

    appState.applyRealtimePet({ id: 'p2', hunger: 10 });
    await appState.poll();

    expect(get(appState.pets)[1].hunger).toBe(50); // el sondeo trae la lista del servidor
    expect(fresh).toHaveBeenCalledTimes(2);
  });

  it('vaciar la sesión conserva la tienda; el bloqueo deja solo al usuario marcado', async () => {
    await appState.load();
    const current = get(appState.user);

    appState.clear();
    expect(get(appState.user)).toBeNull();
    expect(get(appState.currentPet)).toBeNull();
    expect(get(appState.shopItems)).toHaveLength(1);

    appState.lock('unverified', current);
    expect(get(appState.user)).toMatchObject({ id: 'u1', emailVerified: false });
  });
});

describe('appState con núcleo (dentro de la app)', () => {
  beforeEach(() => {
    core.present = true;
    core.stateLoad.mockResolvedValue({ session: true, lock: null, offline: false });
  });

  it('pinta el estado guardado y deja que el núcleo cargue el resto', async () => {
    storage.set('pockai_active_pet', 'p2');
    core.snapshot = { rev: 7, user: { id: 'u1' }, pets: PETS, activePetId: 'p2', eggs: [], inventory: [], shop: [] };

    const result = await appState.load();

    expect(result).toEqual({ session: true, lock: null, offline: false });
    expect(core.stateLoad).toHaveBeenCalledWith(expect.objectContaining({ legacyActivePetId: 'p2' }));
    expect(get(appState.currentPet).id).toBe('p2');
    // La elección ya vive en el núcleo: se retira la copia del webview.
    expect(storage.has('pockai_active_pet')).toBe(false);
    expect(api.getPets).not.toHaveBeenCalled();
  });

  it('refleja los cambios que anuncia el núcleo y descarta los atrasados', async () => {
    core.snapshot = { rev: 5, user: { id: 'u1' }, pets: PETS, activePetId: null, eggs: [], inventory: [], shop: [] };
    await appState.load();
    const fresh = vi.fn();
    appState.onServerPets(fresh);

    core.emit({ slice: 'pets', rev: 6, value: [{ id: 'p1', hunger: 5 }], source: 'server' });
    core.emit({ slice: 'user', rev: 7, value: { id: 'u1', coins: 99 }, source: 'server' });
    core.emit({ slice: 'pets', rev: 4, value: [], source: 'local' });

    expect(get(appState.pets)).toEqual([{ id: 'p1', hunger: 5 }]);
    expect(get(appState.user).coins).toBe(99);
    expect(fresh).toHaveBeenCalledTimes(1);
  });

  it('entrega al núcleo los cambios de la UI en vez de guardarlos aquí', async () => {
    core.snapshot = { rev: 1, user: { id: 'u1' }, pets: PETS, activePetId: null, eggs: [], inventory: [], shop: [] };
    await appState.load();

    appState.applyPet({ id: 'p1', hunger: 100 }, false);
    appState.patchActivePet({ stage: 'teen' });
    appState.selectPet('p2');
    await appState.refreshUser();
    await appState.poll();
    appState.applyRealtimePet({ id: 'p2', hunger: 1 });
    appState.userChangedOnServer();

    expect(core.stateApplyPet).toHaveBeenCalledWith({ id: 'p1', hunger: 100 }, false);
    expect(core.statePatchPet).toHaveBeenCalledWith('p1', { stage: 'teen' });
    expect(core.stateSelectPet).toHaveBeenCalledWith('p2');
    expect(core.stateRefresh).toHaveBeenCalledWith('user');
    // La red es del núcleo: ni sondeo, ni activación, ni refrescos desde la UI.
    expect(api.getPets).not.toHaveBeenCalled();
    expect(api.getMe).not.toHaveBeenCalled();
    expect(api.activatePet).not.toHaveBeenCalled();
    expect(storage.has('pockai_active_pet')).toBe(false);
    // El `pet:update` lo aplica el núcleo: aquí no se toca.
    expect(get(appState.pets)[1].hunger).toBe(50);
  });
});
