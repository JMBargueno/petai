import { Test } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { BattleLockService } from './battle-lock.service';
import { RedisService } from '../../redis/redis.service';

/**
 * BattleLockService — unidad.
 *
 * Guard "una pelea a la vez por usuario", distribuido por Redis (SET NX + TTL) y con fallback en
 * memoria si Redis no está disponible (R-02: el guard se respeta entre réplicas).
 */
describe('BattleLockService', () => {
  let service: BattleLockService;
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
        BattleLockService,
        { provide: RedisService, useValue: { key: (n: string) => n, run } },
      ],
    }).compile();
    service = mod.get(BattleLockService);
  });

  it('adquiere el lock en Redis, ejecuta fn y lo libera (compare-and-delete)', async () => {
    redisOk();
    fakeClient.set.mockResolvedValue('OK'); // adquirido
    fakeClient.eval.mockResolvedValue(1); // liberado
    const val = await service.runExclusive('u1', async () => 'pelea-hecha');
    expect(val).toBe('pelea-hecha');
    const setArgs = fakeClient.set.mock.calls[0];
    expect(setArgs[0]).toBe('battle:active:u1');
    expect(setArgs[2]).toBe('PX'); // TTL
    expect(setArgs[4]).toBe('NX'); // solo si no existe
    expect(fakeClient.eval).toHaveBeenCalledTimes(1);
    expect(fakeClient.eval.mock.calls[0][2]).toBe('battle:active:u1');
  });

  it('lanza 429 y no ejecuta fn si otra réplica ya tiene el lock', async () => {
    redisOk();
    fakeClient.set.mockResolvedValue(null); // ocupado → 'held'
    const fn = jest.fn();
    await expect(service.runExclusive('u1', fn)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    expect(fn).not.toHaveBeenCalled();
    expect(fakeClient.eval).not.toHaveBeenCalled(); // no se libera lo que no se adquirió
  });

  it('si Redis cae degrada al guard en memoria: bloquea lo concurrente y libera al terminar', async () => {
    redisDown();
    let releaseFn: () => void;
    const gate = new Promise<void>((r) => (releaseFn = r));

    const first = service.runExclusive('u1', async () => {
      await gate; // la primera pelea sigue "en curso"
      return 'ok';
    });
    // Mientras la primera está en curso, una segunda del mismo usuario se bloquea (fallback).
    await expect(service.runExclusive('u1', async () => 'no-debería')).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    releaseFn!();
    await expect(first).resolves.toBe('ok');

    // Tras terminar la primera, el guard se liberó: una siguiente pelea sí pasa.
    await expect(service.runExclusive('u1', async () => 'segunda')).resolves.toBe('segunda');
  });

  it('si fn lanza, el guard se libera igualmente (finally)', async () => {
    redisOk();
    fakeClient.set.mockResolvedValue('OK');
    fakeClient.eval.mockResolvedValue(1);
    await expect(service.runExclusive('u1', async () => {
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect(fakeClient.eval).toHaveBeenCalledTimes(1); // se liberó el lock a pesar del error
    // y una pelea posterior es posible
    await expect(service.runExclusive('u1', async () => 'recuperada')).resolves.toBe('recuperada');
  });
});
