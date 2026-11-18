import { CoopCareService } from './coop-care.service';

/**
 * Hook de XP compartida: tras una visita co-op exitosa se emite `clan:activity` (el procesamiento
 * de la XP y del avance de las metas del clan lo hace `ClansService.onClanActivity`). La visita
 * nunca debe romperse aunque algo falle aguas abajo.
 */

function buildPrisma(): any {
  const prisma: any = {};
  prisma.coopFriendship = { findFirst: jest.fn(async () => ({ id: 'f' })) };
  prisma.pet = {
    findFirst: jest.fn(async () => ({ id: 'pet-1', userId: 'owner', hunger: 50, happiness: 50, hygiene: 50 })),
    findUnique: jest.fn(async () => null),
    update: jest.fn(async () => ({})),
  };
  prisma.coopVisit = { count: jest.fn(async () => 0), create: jest.fn(async () => ({})) };
  prisma.$transaction = jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)));
  return prisma;
}

const events = { emit: jest.fn() };
const service = (prisma: any = buildPrisma()) => new CoopCareService(prisma as never, events as never, undefined);
const ownerId = 'owner';
const visitorId = 'visitor';

describe('CoopCareService — XP compartida al clan vía evento clan:activity', () => {
  it('processVisit emite clan:activity con la xp ganada y 1 visita (play=10)', async () => {
    const prisma = buildPrisma();
    const res = await service(prisma).processVisit(ownerId, visitorId, { action: 'play', petId: 'pet-1' });
    expect(res.success).toBe(true);
    expect(res.xpGained).toBe(10);
    expect(events.emit).toHaveBeenCalledWith('clan:activity', { userId: ownerId, xp: 10, visits: 1 });
  });

  it('processVisit emite clan:activity para cada acción (feed=5)', async () => {
    const prisma = buildPrisma();
    await service(prisma).processVisit(ownerId, visitorId, { action: 'feed', petId: 'pet-1' });
    expect(events.emit).toHaveBeenCalledWith('clan:activity', { userId: ownerId, xp: 5, visits: 1 });
  });

  it('processVisit no hace un write directo al clan (la XP la procesa el listener)', async () => {
    const prisma = buildPrisma();
    await service(prisma).processVisit(ownerId, visitorId, { action: 'clean', petId: 'pet-1' });
    expect((prisma as any).clan).toBeUndefined();
    expect(events.emit).toHaveBeenCalledWith('clan:activity', { userId: ownerId, xp: 8, visits: 1 });
  });
});
