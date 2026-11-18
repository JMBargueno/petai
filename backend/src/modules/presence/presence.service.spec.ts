import { PresenceService } from './presence.service';

/**
 * PresenceService (Redis-backed, multi-réplica): se prueba decoplando `RedisService` con un mock
 * (`key` con prefijo de entorno y `run` como jest.fn). Se cubre el mapeo de los comandos Redis
 * (hset+pexpire / hgetall / pttl / hdel) y la tolerancia a fallos (run → null degrada sin lanzar).
 */

const EXPIRE_MS = 90000;

function build(run: any) {
  const redis = {
    key: jest.fn((name: string) => `petai:test:${name}`),
    run,
  };
  return new PresenceService({ get: jest.fn() } as any, redis as any);
}

describe('PresenceService (Redis-backed)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('heartbeat escribe el campo del dispositivo y refresca el TTL (presence.set)', async () => {
    const run: any = jest.fn(async () => true);
    await build(run).heartbeat('u1', 'dev1', 'web');
    expect(run).toHaveBeenCalledTimes(1);
    const [fn, command] = run.mock.calls[0];
    expect(command).toBe('presence.set');
    const fakeRedis = {
      hset: jest.fn(async (_k: string, _f: string, _v: string) => 1),
      pexpire: jest.fn(async (_k: string, _ms: number) => true),
    };
    await fn(fakeRedis);
    expect(fakeRedis.hset).toHaveBeenCalledWith(
      'petai:test:presence:u1',
      'dev1',
      expect.stringMatching(/"platform":"web"/),
    );
    expect(fakeRedis.hset.mock.calls[0][2]).toMatch(/"lastHeartbeat":\d+/);
    expect(fakeRedis.pexpire).toHaveBeenCalledWith('petai:test:presence:u1', EXPIRE_MS);
  });

  it('getPresence mapea el hash a DevicePresenceInfo[] con estado online/offline', async () => {
    const now = Date.now();
    const run: any = jest.fn(async () => ({
      devOnline: JSON.stringify({ platform: 'web', lastHeartbeat: now }),
      devOffline: JSON.stringify({ platform: 'ios', lastHeartbeat: now - EXPIRE_MS - 1 }),
    }));
    const result = await build(run).getPresence('u1');
    expect(run.mock.calls[0][1]).toBe('presence.get');
    expect(result).toEqual([
      { deviceId: 'devOnline', platform: 'web', lastHeartbeat: now, status: 'online' },
      { deviceId: 'devOffline', platform: 'ios', lastHeartbeat: now - EXPIRE_MS - 1, status: 'offline' },
    ]);
  });

  it('hasActiveDevices es true cuando PTTL > 0', async () => {
    const run: any = jest.fn(async () => 45_000);
    expect(await build(run).hasActiveDevices('u1')).toBe(true);
    expect(run.mock.calls[0][1]).toBe('presence.pttl');
  });

  it('hasActiveDevices es false cuando PTTL es -2 (clave inexistente)', async () => {
    const run = jest.fn(async () => -2);
    expect(await build(run).hasActiveDevices('u1')).toBe(false);
  });

  it('hasActiveDevices es false cuando run devuelve null (Redis caído)', async () => {
    const run = jest.fn(async () => null);
    expect(await build(run).hasActiveDevices('u1')).toBe(false);
  });

  it('removeDevice usa presence.del sobre el campo del dispositivo', async () => {
    const run: any = jest.fn(async () => 1);
    await build(run).removeDevice('u1', 'dev1');
    const [fn, command] = run.mock.calls[0];
    expect(command).toBe('presence.del');
    const fakeRedis = { hdel: jest.fn(async () => 1) };
    await fn(fakeRedis);
    expect(fakeRedis.hdel).toHaveBeenCalledWith('petai:test:presence:u1', 'dev1');
  });

  it('tolera Redis caído en getPresence (run → null) sin lanzar: devuelve []', async () => {
    const run = jest.fn(async () => null);
    await expect(build(run).getPresence('u1')).resolves.toEqual([]);
  });

  it('tolera Redis caído en heartbeat (run → null) sin lanzar', async () => {
    const run = jest.fn(async () => null);
    await expect(build(run).heartbeat('u1', 'dev1', 'web')).resolves.toBeUndefined();
  });

  it('tolera Redis caído en removeDevice (run → null) sin lanzar', async () => {
    const run = jest.fn(async () => null);
    await expect(build(run).removeDevice('u1', 'dev1')).resolves.toBeUndefined();
  });

  it('cleanup es un no-op y devuelve 0 (el TTL de Redis expira las presencias)', () => {
    expect(build(jest.fn(async () => null)).cleanup()).toBe(0);
  });
});