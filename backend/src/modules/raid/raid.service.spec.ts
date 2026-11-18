import { RaidService } from './raid.service';

/**
 * RaidService.settle — unidad.
 *
 * F-06 (liquidación): al rematarse el jefe se reparten las gemas por proporción de daño, con
 * tope del 50% por jugador, y de forma IDEMPOTENTE (el guard `status not: 'settled'` deja un
 * único `count === 1`; dos réplicas / dos llamas no reparten 2x).
 */
describe('RaidService.settle (F-06: liquidación idempotente y proporcional)', () => {
  function build() {
    const prisma: any = {
      raid: { findUnique: jest.fn(), updateMany: jest.fn() },
      raidParticipant: { findMany: jest.fn() },
      user: { update: jest.fn() },
      $transaction: jest.fn(),
    };
    const gameData: any = { getBalance: () => ({ raids: { totalGems: 1000 } }) };
    // constructor: (prisma, gameData, petsService, battlesService, cronLock, cache)
    const realtime: any = { emitPetAction: jest.fn() };
    const svc = new RaidService(prisma, gameData, {} as any, {} as any, {} as any, {} as any, realtime);
    return { svc, prisma, realtime };
  }

  function txMock(count: number) {
    const tx: any = {
      raid: { updateMany: jest.fn().mockResolvedValue({ count }) },
      user: { update: jest.fn().mockResolvedValue({}) },
    };
    return tx;
  }

  it('reparte por proporción de daño y cap al 50%', async () => {
    const { svc, prisma } = build();
    prisma.raid.findUnique.mockResolvedValue({ id: 'r', status: 'active' });
    prisma.raidParticipant.findMany.mockResolvedValue([
      { userId: 'u1', damageDealt: 900 },
      { userId: 'u2', damageDealt: 100 },
    ]);
    const tx = txMock(1);
    prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

    await (svc as any).settle('r');

    // u1: floor(1000 * 900/1000)=900 → cap 500; u2: floor(1000 * 100/1000)=100.
    const incs = tx.user.update.mock.calls.map((c: any) => c[0].data.gems.increment);
    expect(incs).toEqual([500, 100]);
    expect(tx.raid.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { not: 'settled' } }) }),
    );
  });

  it('es idempotente: si ya está liquidado no reparte de nuevo', async () => {
    const { svc, prisma } = build();
    prisma.raid.findUnique.mockResolvedValue({ id: 'r', status: 'settled' });
    await (svc as any).settle('r');
    expect(prisma.raidParticipant.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('si el reclamo ya fue tomado (count=0) no reparte (doble réplica)', async () => {
    const { svc, prisma } = build();
    prisma.raid.findUnique.mockResolvedValue({ id: 'r', status: 'active' });
    prisma.raidParticipant.findMany.mockResolvedValue([{ userId: 'u1', damageDealt: 100 }]);
    const tx = txMock(0); // otra réplica ya lo liquidó
    prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));
    await (svc as any).settle('r');
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('avisa de la victoria (raid_victory) a cada participante con sus gemas (a su mascota activa)', async () => {
    const { svc, prisma, realtime } = build();
    prisma.raid.findUnique.mockResolvedValue({ id: 'r', status: 'active', theme: 'Inferno Dragon', element: 'fire' });
    prisma.raidParticipant.findMany.mockResolvedValue([
      { userId: 'u1', petId: 'p1', damageDealt: 900 },
      { userId: 'u2', petId: 'p2', damageDealt: 100 },
    ]);
    prisma.$transaction.mockImplementation(async (fn: any) => fn(txMock(1)));
    await (svc as any).settle('r');
    expect(realtime.emitPetAction.mock.calls).toEqual([
      ['u1', null, 'raid_victory', { theme: 'Inferno Dragon', element: 'fire', gems: 500 }],
      ['u2', null, 'raid_victory', { theme: 'Inferno Dragon', element: 'fire', gems: 100 }],
    ]);
  });

  it('si otra réplica liquidó el raid, esta no avisa', async () => {
    const { svc, prisma, realtime } = build();
    prisma.raid.findUnique.mockResolvedValue({ id: 'r', status: 'active', theme: 'X', element: 'fire' });
    prisma.raidParticipant.findMany.mockResolvedValue([{ userId: 'u1', petId: 'p1', damageDealt: 100 }]);
    prisma.$transaction.mockImplementation(async (fn: any) => fn(txMock(0)));
    await (svc as any).settle('r');
    expect(realtime.emitPetAction).not.toHaveBeenCalled();
  });
});
