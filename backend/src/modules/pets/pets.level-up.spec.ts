import { BadRequestException } from '@nestjs/common';
import { PetsService, xpForLevel } from './pets.service';

/** Enhebrador (spec 41): +1 nivel conservando la XP que llevaba dentro del nivel. */
function build(pet: any, effects: any = { levels: 1 }) {
  const prisma: any = {
    item: { findUnique: jest.fn(async ({ where }: any) => ({ id: where.id, kind: 'level_up', effects })) },
    pet: { update: jest.fn(async ({ data }: any) => ({ ...pet, ...data })) },
  };
  const inventory: any = { consumeItem: jest.fn(async () => ({})) };
  const realtime: any = { emitPetUpdate: jest.fn(), emitPetAction: jest.fn() };
  const events: any = { emit: jest.fn() };
  const gameData: any = { getBalance: () => ({ evolution: { finalStageItemId: 'evolution_stone' } }) };
  const service = new PetsService(prisma, inventory, realtime, gameData, events, {} as any);
  jest.spyOn(service, 'getPetById').mockResolvedValue(pet);
  return { service, prisma, inventory, events };
}

describe('PetsService.useLevelUpItem', () => {
  it('sube un nivel y conserva la XP dentro del nivel', async () => {
    const pet = { id: 'p1', userId: 'u1', level: 7, xp: 120, statPoints: 0, stage: 'baby' };
    const { service, inventory, events } = build(pet);
    const res: any = await service.useItem('u1', 'p1', 'ether_threader');
    expect(inventory.consumeItem).toHaveBeenCalledWith('u1', 'ether_threader', 'level_up');
    expect(res.level).toBe(8);
    expect(res.xp).toBe(120);
    expect(res.statPoints).toBe(3);
    expect(events.emit).toHaveBeenCalledWith('pet:level_up', { userId: 'u1', petId: 'p1' });
  });

  it('cruza el umbral de etapa como cualquier subida', async () => {
    const pet = { id: 'p1', userId: 'u1', level: 9, xp: 0, statPoints: 0, stage: 'baby' };
    const { service } = build(pet);
    const res: any = await service.useLevelUpItem('u1', 'p1', 'ether_threader');
    expect(res.level).toBe(10);
    expect(res.stage).toBe('juvenile');
  });

  it('con levels > 1 sube varios niveles sin pasarse del máximo', async () => {
    const pet = { id: 'p1', userId: 'u1', level: 98, xp: 5, statPoints: 0, stage: 'adult' };
    const { service } = build(pet, { levels: 5 });
    const res: any = await service.useLevelUpItem('u1', 'p1', 'ether_threader');
    expect(res.level).toBe(100);
    expect(res.xp).toBe(5);
  });

  it('en el nivel máximo se rechaza sin gastar el objeto', async () => {
    const pet = { id: 'p1', userId: 'u1', level: 100, xp: 0, statPoints: 0, stage: 'final' };
    const { service, inventory } = build(pet);
    await expect(service.useLevelUpItem('u1', 'p1', 'ether_threader')).rejects.toBeInstanceOf(BadRequestException);
    expect(inventory.consumeItem).not.toHaveBeenCalled();
  });

  it('xpForLevel sigue la curva de siempre', () => {
    expect(xpForLevel(1)).toBe(100);
    expect(xpForLevel(4)).toBe(800);
  });
});
