import { Test } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { ExclusiveLockService } from './exclusive-lock.service';
import { RedisService } from './redis.service';

/**
 * ExclusiveLockService — unidad.
 *
 * Guard "una operación a la vez por (scope, clave)", distribuido por Redis (SET NX + TTL) y con
 * fallback en memoria si Redis no está disponible (R-02: se respeta entre réplicas).
 */
describe('ExclusiveLockService', () => {
  let service: ExclusiveLockService;
  let run: jest.Mock;
  const fakeClient = { set: jest.fn(), eval: jest.fn() };

  function redisOk() {
    run.mockImplementation(async (fn: (c: unknown) => Promise<unknown>) => fn(fakeClient));
  }
  function redisDown() {
    run.mockResolvedValue(null);
  }

  beforeEach(async () => {
    jest.resetAllMocks();
    run = jest.fn();
    const mod = await Test.createTestingModule({
      providers: [
        ExclusiveLockService,
        { provide: RedisService, useValue: { key: (n: string) => n, run } },
      ],
    }).compile();
    service = mod.get(ExclusiveLockService);
  });

  it('runExclusive: adquiere el lock en Redis, ejecuta fn y lo libera (compare-and-delete)', async () => {
    redisOk();
    fakeClient.set.mockResolvedValue('OK');
    fakeClient.eval.mockResolvedValue(1);
    const val = await service.runExclusive('battle', 'u1', async () => 'hecho');
    expect(val).toBe('hecho');
    const setArgs = fakeClient.set.mock.calls[0];
    expect(setArgs[0]).toBe('exclusive:battle:u1');
    expect(setArgs[2]).toBe('PX');
    expect(setArgs[4]).toBe('NX');
    expect(fakeClient.eval).toHaveBeenCalledTimes(1);
    expect(fakeClient.eval.mock.calls[0][2]).toBe('exclusive:battle:u1');
  });

  it('runExclusive: lanza 429 si otra réplica ya tiene el lock y no ejecuta fn', async () => {
    redisOk();
    fakeClient.set.mockResolvedValue(null); // ocupado → 'held'
    const fn = jest.fn();
    await expect(service.runExclusive('battle', 'u1', fn)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    expect(fn).not.toHaveBeenCalled();
    expect(fakeClient.eval).not.toHaveBeenCalled();
  });

  it('si Redis cae degrada al fallback en memoria: bloquea lo concurrente y libera al terminar', async () => {
    redisDown();
    let releaseFn: () => void;
    const gate = new Promise<void>((r) => (releaseFn = r));

    const first = service.runExclusive('chat', 'u1', async () => {
      await gate; // la operación sigue "en curso"
      return 'ok';
    });
    await expect(service.runExclusive('chat', 'u1', async () => 'no')).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    releaseFn!();
    await expect(first).resolves.toBe('ok');
    // Tras terminar, el guard se liberó: una siguiente operación sí pasa.
    await expect(service.runExclusive('chat', 'u1', async () => 'otra')).resolves.toBe('otra');
  });

  it('acquire/release explícitos: flujo de streaming (el llamante suelta en finally)', async () => {
    redisOk();
    // Simula la semántica NX: la clave no se puede volver a tomar hasta que se libera.
    const heldKeys = new Set<string>();
    fakeClient.set.mockImplementation(async (key: string) => {
      if (heldKeys.has(key)) return null;
      heldKeys.add(key);
      return 'OK';
    });
    fakeClient.eval.mockImplementation(async (_s: string, _n: number, key: string) => {
      heldKeys.delete(key);
      return 1;
    });

    const lock = await service.acquire('chat', 'u2');
    expect(lock.ok).toBe(true);
    // Mientras se mantiene, una segunda adquisición del mismo recurso se deniega.
    const second = await service.acquire('chat', 'u2');
    expect(second.ok).toBe(false);
    // Al soltar, se puede re-adquirir (simula el finally del generador).
    await service.release('chat', 'u2', lock.token);
    await expect(service.acquire('chat', 'u2')).resolves.toMatchObject({ ok: true });
  });

  it('si fn lanza, el guard se libera igualmente (finally)', async () => {
    redisOk();
    fakeClient.set.mockResolvedValue('OK');
    fakeClient.eval.mockResolvedValue(1);
    await expect(service.runExclusive('battle', 'u1', async () => {
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect(fakeClient.eval).toHaveBeenCalledTimes(1);
    await expect(service.runExclusive('battle', 'u1', async () => 'recuperado')).resolves.toBe('recuperado');
  });
});
