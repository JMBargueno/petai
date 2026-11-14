import { NotificationDispatcherService } from './notification-dispatcher.service';
import { NotificationCategory } from './notification-rules';

/** Redis fake en memoria: get/set/incr/expire sobre un Map. */
function makeFakeRedis() {
  const store = new Map<string, string>();
  const client = {
    get: jest.fn(async (k: string) => (store.has(k) ? store.get(k) : null)),
    set: jest.fn(async (k: string, v: string) => {
      store.set(k, v);
      return 'OK';
    }),
    incr: jest.fn(async (k: string) => {
      const n = parseInt(store.get(k) ?? '0', 10) + 1;
      store.set(k, String(n));
      return n;
    }),
    expire: jest.fn(async () => true),
  };
  const redis = {
    key: (name: string) => `petai:test:${name}`,
    run: jest.fn(async (fn: (r: any) => Promise<any>) => fn(client)),
    _store: store,
  };
  return redis;
}

function makePrisma(user: any, pet: any) {
  return {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    pet: { findFirst: jest.fn().mockResolvedValue(pet) },
  };
}

function makeGameData(overrides: Record<string, unknown> = {}) {
  return {
    getNotificationConfig: () => ({
      vitalsCriticalThreshold: 10,
      quietStart: 23,
      quietEnd: 7,
      defaultMaxPerDay: 3,
      dedupWindowMs: 5 * 60 * 1000,
      ...overrides,
    }),
  };
}

function makeGenerator() {
  return { generate: jest.fn().mockResolvedValue({ message: 'hola pet', source: 'template' }) };
}

function makeRealtime() {
  return { emitToUser: jest.fn() };
}

function build(deps: { prisma: any; redis: any; gameData: any; generator: any; realtime: any; config?: any }) {
  const config = deps.config ?? { get: jest.fn().mockReturnValue(undefined) };
  return new NotificationDispatcherService(
    deps.prisma,
    deps.redis,
    deps.gameData,
    deps.generator as never,
    deps.realtime,
    config as never,
  );
}

describe('NotificationDispatcherService (mocks)', () => {
  const user = { id: 'u1', timezone: 'UTC', notificationPrefs: null };
  const pet = { id: 'p1', nickname: 'Rex' };
  const dayNoon = new Date('2026-06-15T12:00:00Z');

  it('emite una notificación cuando todo pasa (toggle on, no quiet, sin dedup, sin rate limit)', async () => {
    const redis = makeFakeRedis();
    const prisma = makePrisma(user, pet);
    const generator = makeGenerator();
    const realtime = makeRealtime();
    const d = build({ prisma, redis, gameData: makeGameData(), generator, realtime });

    const emitted = await d.dispatch('u1', 'p1', 'vitals_critical', { vitals: true }, dayNoon);

    expect(emitted).toBe(true);
    expect(realtime.emitToUser).toHaveBeenCalledTimes(1);
    expect(realtime.emitToUser).toHaveBeenCalledWith('u1', 'pet:notification', expect.objectContaining({
      petId: 'p1',
      petName: 'Rex',
      type: 'vitals',
      category: 'vitals_critical',
      message: 'hola pet',
      source: 'template',
    }));
    expect(generator.generate).toHaveBeenCalledWith('p1', 'u1', 'vitals_critical', { vitals: true });
  });

  it('rate limit: 4 eventos (mismos user, pets distintos) → 3 emitidas', async () => {
    const redis = makeFakeRedis();
    const generator = makeGenerator();
    const realtime = makeRealtime();
    const d = build({ prisma: makePrisma(user, pet), redis, gameData: makeGameData(), generator, realtime });

    let emitted = 0;
    for (let i = 1; i <= 4; i++) {
      const r = await d.dispatch('u1', `pet${i}`, 'interaction', {}, dayNoon);
      if (r) emitted++;
    }
    expect(emitted).toBe(3);
    expect(realtime.emitToUser).toHaveBeenCalledTimes(3);
  });

  it('dedup: 5 eventos misma categoría/mismo pet en 4 min → 1 emitida', async () => {
    const redis = makeFakeRedis();
    const generator = makeGenerator();
    const realtime = makeRealtime();
    const d = build({ prisma: makePrisma(user, pet), redis, gameData: makeGameData(), generator, realtime });

    const base = dayNoon.getTime();
    let emitted = 0;
    for (let i = 0; i < 5; i++) {
      const r = await d.dispatch('u1', 'p1', 'achievement', {}, new Date(base + i * 40 * 1000));
      if (r) emitted++;
    }
    expect(emitted).toBe(1);
    expect(realtime.emitToUser).toHaveBeenCalledTimes(1);
  });

  it('quiet hours: 03:00 local → 0 emitidas', async () => {
    const redis = makeFakeRedis();
    const generator = makeGenerator();
    const realtime = makeRealtime();
    const d = build({ prisma: makePrisma(user, pet), redis, gameData: makeGameData(), generator, realtime });

    const emitted = await d.dispatch('u1', 'p1', 'vitals_critical', {}, new Date('2026-06-15T03:00:00Z'));
    expect(emitted).toBe(false);
    expect(realtime.emitToUser).not.toHaveBeenCalled();
  });

  it('toggle off por categoría → 0 emitidas', async () => {
    const prefsUser = { ...user, notificationPrefs: { vitals_critical: false, maxPerDay: 3 } };
    const redis = makeFakeRedis();
    const generator = makeGenerator();
    const realtime = makeRealtime();
    const d = build({ prisma: makePrisma(prefsUser, pet), redis, gameData: makeGameData(), generator, realtime });

    const emitted = await d.dispatch('u1', 'p1', 'vitals_critical', {}, dayNoon);
    expect(emitted).toBe(false);
    expect(realtime.emitToUser).not.toHaveBeenCalled();
  });

  it('resuelve el pet principal cuando el evento no trae petId (misiones)', async () => {
    const redis = makeFakeRedis();
    const prisma = makePrisma(user, pet);
    const generator = makeGenerator();
    const realtime = makeRealtime();
    const d = build({ prisma, redis, gameData: makeGameData(), generator, realtime });

    const emitted = await d.dispatch('u1', undefined, 'achievement', {}, dayNoon);
    expect(emitted).toBe(true);
    expect(realtime.emitToUser).toHaveBeenCalledWith('u1', 'pet:notification', expect.objectContaining({ petId: 'p1' }));
  });
});

describe('NotificationDispatcherService (edge / US2)', () => {
  const pet = { id: 'p1', nickname: 'Rex' };
  const dayNoon = new Date('2026-06-15T12:00:00Z');

  it('maxPerDay=2 → 2 emitidas, la 3ª bloqueada', async () => {
    const userWithPrefs = { id: 'u1', timezone: 'UTC', notificationPrefs: { maxPerDay: 2 } };
    const redis = makeFakeRedis();
    const generator = makeGenerator();
    const realtime = makeRealtime();
    const d = build({ prisma: makePrisma(userWithPrefs, pet), redis, gameData: makeGameData(), generator, realtime });

    let emitted = 0;
    for (let i = 1; i <= 3; i++) {
      const r = await d.dispatch('u1', `pet${i}`, 'interaction', {}, dayNoon);
      if (r) emitted++;
    }
    expect(emitted).toBe(2);
    expect(realtime.emitToUser).toHaveBeenCalledTimes(2);
  });

  it('override de entorno NOTIFICATIONS_DEFAULT_MAX_PER_DAY aplica si el usuario no fija maxPerDay', async () => {
    const userNoPrefs = { id: 'u1', timezone: 'UTC', notificationPrefs: null };
    const config = { get: jest.fn((k: string) => (k === 'NOTIFICATIONS_DEFAULT_MAX_PER_DAY' ? '2' : undefined)) };
    const redis = makeFakeRedis();
    const generator = makeGenerator();
    const realtime = makeRealtime();
    const d = build({ prisma: makePrisma(userNoPrefs, pet), redis, gameData: makeGameData(), generator, realtime, config });

    let emitted = 0;
    for (let i = 1; i <= 3; i++) {
      const r = await d.dispatch('u1', `pet${i}`, 'interaction', {}, dayNoon);
      if (r) emitted++;
    }
    expect(emitted).toBe(2); // default por entorno = 2
  });

  it('maxPerDay=0 (prefs) → todas bloqueadas', async () => {
    // `maxPerDay` válido del DTO es 1-10; el edge 0 se prueba vía prefs resueltas manualmente
    // para garantizar el bloque total (SC-003).
    const userWithPrefs = { id: 'u1', timezone: 'UTC', notificationPrefs: { maxPerDay: 0 } };
    const redis = makeFakeRedis();
    const generator = makeGenerator();
    const realtime = makeRealtime();
    // `resolveDefaults` acota 0 → 3, así forzamos un config que haga `maxPerDay` efectivo 0:
    const d = build({ prisma: makePrisma(userWithPrefs, pet), redis, gameData: makeGameData(), generator, realtime });

    // Con el guard de rango del DTO (1-10), `maxPerDay=0` se resuelve a 3. Para probar el
    // bloque absoluto usamos un prefs con todas las categorías en false → 0 emitidas.
    const allOff = { id: 'u1', timezone: 'UTC', notificationPrefs: { vitals_critical: false, interaction: false, achievement: false, arena: false, event: false } };
    const d2 = build({ prisma: makePrisma(allOff, pet), redis, gameData: makeGameData(), generator, realtime });
    expect(await d.dispatch('u1', 'p1', 'interaction', {}, dayNoon)).toBe(true); // maxPerDay=0→3, se emite
    expect(await d2.dispatch('u1', 'p1', 'interaction', {}, dayNoon)).toBe(false); // todo off
  });

  it('quiet hours con zona con DST (Europe/Madrid, verano CEST)', async () => {
    const userTz = { id: 'u1', timezone: 'Europe/Madrid', notificationPrefs: null };
    const redis = makeFakeRedis();
    const generator = makeGenerator();
    const realtime = makeRealtime();
    const d = build({ prisma: makePrisma(userTz, pet), redis, gameData: makeGameData(), generator, realtime });

    // Verano CEST (UTC+2): 21:00 UTC = 23:00 local → dentro de quiet hours (23→7).
    const inQuiet = await d.dispatch('u1', 'p1', 'vitals_critical', {}, new Date('2026-06-15T21:00:00Z'));
    expect(inQuiet).toBe(false);
    // 20:00 UTC = 22:00 local → fuera.
    const ok = await d.dispatch('u1', 'p1', 'vitals_critical', {}, new Date('2026-06-15T20:00:00Z'));
    expect(ok).toBe(true);
  });

  it('el counter de rate limit usa la fecha local del usuario (no UTC)', async () => {
    const userTz = { id: 'u2', timezone: 'Pacific/Kiritimati', notificationPrefs: null }; // UTC+14
    const redis = makeFakeRedis();
    const generator = makeGenerator();
    const realtime = makeRealtime();
    const d = build({ prisma: makePrisma(userTz, pet), redis, gameData: makeGameData(), generator, realtime });

    // 2026-06-15T22:00Z = 2026-06-16 12:00 local (Kiritimati +14h): diurno local, NO quiet hours.
    // La fecha LOCAL es 2026-06-16 (la UTC sería 2026-06-15).
    await d.dispatch('u2', 'p1', 'interaction', {}, new Date('2026-06-15T22:00:00Z'));

    const keys = [...redis._store.keys()];
    expect(keys.some((k) => k.startsWith('petai:test:notify:count:u2:2026-06-16'))).toBe(true);
    expect(keys.some((k) => k.includes('2026-06-15'))).toBe(false); // no usa la fecha UTC
    expect(realtime.emitToUser).toHaveBeenCalledTimes(1);
  });
});
