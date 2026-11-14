import { ConfigService } from '@nestjs/config';
import { DeltaSyncService, SyncAction } from './delta-sync.service';

const A = (n: string) => `action-${n}-000000`;
const act = (id: string, petId: string, type: SyncAction['type'] = 'feed', args: Record<string, unknown> = {}): SyncAction =>
  ({ id, petId, type, args, timestamp: Date.now() });

function build(overrides: Record<string, number | string> = {}) {
  const configService = new ConfigService({
    SYNC_STATE_TTL_MS: 86_400_000,
    SYNC_MAX_DELTAS: 2000,
    SYNC_MAX_SEEN_ACTIONS: 1000,
    SYNC_MAX_ARGS_BYTES: 4096,
    SYNC_MAX_PETS: 100,
    SYNC_ENABLED: 'true',
    ...overrides,
  });
  const prismaMock = { pet: { findMany: jest.fn().mockResolvedValue([]) } };
  // Redis "caído": `run` devuelve null → todo pasa por el respaldo en memoria (misma lógica de topes/ownership/pull).
  const redisMock = { run: jest.fn(async () => null), key: jest.fn((k: string) => `petai:test:${k}`) };
  const service = new DeltaSyncService(configService, redisMock as never, prismaMock as never, {} as never);
  return { service, prismaMock };
}

/** Mock de ownership: `findMany` devuelve solo los ids presentes en `ownedIds` (el resto → ajeno). */
const own = (ownedIds: string[]) => async ({ where }: { where: { id: { in: string[] } } }) =>
  where.id.in.filter((id) => ownedIds.includes(id)).map((id) => ({ id }));

describe('DeltaSyncService (S-07)', () => {
  it('rechaza args > SYNC_MAX_ARGS_BYTES sin mutar el estado', async () => {
    const { service, prismaMock } = build({ SYNC_MAX_ARGS_BYTES: 64 });
    prismaMock.pet.findMany.mockImplementation(own(['pet-1']));
    const res = await service.push('u1', [act(A('a1'), 'pet-1', 'feed', { blob: 'x'.repeat(200) })]);
    expect(res.applied).toEqual([]);
    expect(res.rejected).toEqual([{ actionId: A('a1'), reason: 'args_too_large' }]);
    expect(res.newVersion).toBe(0);
    expect(res.state).toEqual({});
  });

  it('rechaza por ownership si el petId no es del usuario', async () => {
    const { service, prismaMock } = build();
    prismaMock.pet.findMany.mockImplementation(own(['pet-1'])); // pet-2 NO es del usuario
    const res = await service.push('u1', [act(A('a1'), 'pet-1'), act(A('a2'), 'pet-2', 'play')]);
    expect(res.applied).toEqual([A('a1')]);
    expect(res.rejected).toEqual([{ actionId: A('a2'), reason: 'ownership' }]);
  });

  it('idempotencia: repetir el mismo actionId no lo reaplica', async () => {
    const { service, prismaMock } = build();
    prismaMock.pet.findMany.mockImplementation(own(['pet-1']));
    const r1 = await service.push('u1', [act(A('a1'), 'pet-1')]);
    const r2 = await service.push('u1', [act(A('a1'), 'pet-1')]);
    expect(r1.applied).toEqual([A('a1')]);
    expect(r1.newVersion).toBe(1);
    expect(r2.applied).toEqual([]);
    expect(r2.newVersion).toBe(1);
  });

  it('pull filtra por version > since (no por timestamp)', async () => {
    const { service, prismaMock } = build();
    prismaMock.pet.findMany.mockImplementation(own(['pet-1']));
    await service.push('u1', [act(A('a1'), 'pet-1')]);
    await service.push('u1', [act(A('a2'), 'pet-1', 'play')]);
    const all = await service.pull('u1', 0);
    expect(all.version).toBe(2);
    expect(all.deltas).toHaveLength(2);
    const since1 = await service.pull('u1', 1);
    expect(since1.deltas).toHaveLength(1);
    expect(since1.deltas[0].version).toBe(2);
  });

  it('acota los deltas a SYNC_MAX_DELTAS', async () => {
    const { service, prismaMock } = build({ SYNC_MAX_DELTAS: 3 });
    prismaMock.pet.findMany.mockImplementation(own(['pet-1']));
    const actions = Array.from({ length: 5 }, (_, i) => act(A(`a${i}`), 'pet-1'));
    await service.push('u1', actions);
    const p = await service.pull('u1', 0);
    expect(p.deltas.length).toBeLessThanOrEqual(3);
  });

  it('acota las mascotas a SYNC_MAX_PETS', async () => {
    const { service, prismaMock } = build({ SYNC_MAX_PETS: 2 });
    prismaMock.pet.findMany.mockImplementation(own(['pet-1', 'pet-2', 'pet-3']));
    const res = await service.push('u1', [act(A('a1'), 'pet-1'), act(A('a2'), 'pet-2'), act(A('a3'), 'pet-3')]);
    expect(res.applied).toEqual([A('a1'), A('a2')]);
    expect(res.rejected).toContainEqual({ actionId: A('a3'), reason: 'max_pets' });
  });

  it('SYNC_ENABLED=false → 503', async () => {
    const { service } = build({ SYNC_ENABLED: 'false' });
    await expect(service.push('u1', [act(A('a1'), 'pet-1')])).rejects.toThrow('Sync deshabilitado');
  });
});