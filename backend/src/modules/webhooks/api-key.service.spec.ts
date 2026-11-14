import { ApiKeyService } from './api-key.service';

describe('ApiKeyService (S-16)', () => {
  it('enforceRateLimit: INCR+PEXPIRE atómico y 429 al exceder el límite', async () => {
    let n = 0;
    const incr = jest.fn(async () => ++n);
    const pexpire = jest.fn(async () => 1);
    const redisMock = { key: jest.fn((k: string) => k), run: jest.fn((fn: (r: unknown) => Promise<unknown>) => fn({ incr, pexpire })) };
    const service = new ApiKeyService({} as never, redisMock as never);

    for (let i = 1; i <= 100; i++) await service.enforceRateLimit('key1'); // RATE_LIMIT_PER_MIN = 100
    expect(incr).toHaveBeenCalledTimes(100);
    expect(pexpire).toHaveBeenCalledTimes(1); // la caducidad se fija solo en el primer INCR
    await expect(service.enforceRateLimit('key1')).rejects.toThrow('Rate limit excedido');
  });

  it('list no expone keyHash', async () => {
    const prismaMock = {
      apiKey: { findMany: jest.fn(async () => [{ id: 'k1', name: 'n', keyHash: 'secret', scopes: ['read:pets'], lastUsedAt: null, revokedAt: null, createdAt: new Date() }]) },
    };
    const service = new ApiKeyService(prismaMock as never, {} as never);
    const list = await service.list('u1');
    expect(list[0]).not.toHaveProperty('keyHash');
    expect(list[0]).toMatchObject({ id: 'k1', name: 'n', scopes: ['read:pets'] });
  });
});