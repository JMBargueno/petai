import * as fs from 'fs';
import * as path from 'path';
import { AutonomyService } from './autonomy.service';
import { intervalIndex } from './autonomy.engine';
import { neutralDims } from './personality.engine';

const balance = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../shared/game-data/balance.json'), 'utf8'));
const cfg = balance.personality.autonomy;
const HOUR = 3_600_000;
/** Mediodía en UTC: las 21:00 en Tokio, las 04:00 en Los Ángeles (noviembre). */
const NOW = new Date('2026-11-18T12:00:00Z');

function setup(timezone: string, personality: Record<string, unknown> = {}) {
  const pet: any = {
    id: 'pet-1',
    userId: 'u1',
    nickname: 'Lumo',
    energy: 100,
    happiness: 50,
    inHabitat: false,
    sleeping: false,
    sick: false,
    autonomyCursor: intervalIndex(NOW, cfg) - 9,
    lastInteractionAt: new Date(NOW.getTime() - 12 * HOUR),
    personality: { dims: neutralDims(), ...personality },
  };
  const prisma: any = {
    pet: { updateMany: jest.fn(async () => ({ count: 1 })), update: jest.fn(async () => pet), findUnique: jest.fn(async () => null) },
    user: { findUnique: jest.fn(async () => ({ timezone, displayName: 'Jose' })), findMany: jest.fn(async () => []) },
    coopFriendship: { findMany: jest.fn(async () => []) },
    item: { findUnique: jest.fn(async () => null) },
    inventoryItem: { upsert: jest.fn() },
  };
  const mind: any = {
    config: () => balance.personality,
    ensureDims: jest.fn(async (p: any) => ({ dims: p.personality.dims, stored: p.personality })),
    applyExperience: jest.fn(async () => undefined),
  };
  const memory: any = { situationRows: jest.fn(async () => []), remember: jest.fn(async () => 0) };
  const gameData: any = { getFoods: () => [] };
  const svc = new AutonomyService(prisma, gameData, mind, memory);
  return { svc, pet, prisma, mind, memory };
}

describe('AutonomyService — rutinas (spec 41, fase F)', () => {
  it('guarda en qué andaba para retomarlo en la siguiente lectura', async () => {
    const s = setup('UTC');
    await s.svc.catchUp(s.pet, NOW);
    const patch = s.mind.applyExperience.mock.calls[0][3];
    expect(patch.routine).toMatchObject({ index: intervalIndex(NOW, cfg) - 1 });
    expect(typeof patch.routine.last).toBe('string');
    expect(patch.autonomy.day).toBe('2026-11-18');
  });

  it('usa la hora local de su entrenador: la misma ausencia es noche en un sitio y día en otro', async () => {
    // Las ocho horas simuladas van de las 04:00 a las 11:00 UTC
    const night = setup('America/Los_Angeles'); // de 20:00 a 03:00: casi todo noche
    const day = setup('Asia/Tokyo'); // de 13:00 a 20:00: tarde
    await night.svc.catchUp(night.pet, NOW);
    await day.svc.catchUp(day.pet, NOW);
    const patchNight = night.mind.applyExperience.mock.calls[0][3];
    const patchDay = day.mind.applyExperience.mock.calls[0][3];
    // De noche acaba descansando y lleva horas así; la zona horaria se pidió para el dueño
    expect(patchNight.routine.last).toBe('rest');
    expect(patchNight.routine.streak).toBeGreaterThanOrEqual(2);
    expect(night.prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1' } }));
    expect(patchDay.routine).not.toEqual(patchNight.routine);
  });

  it('una zona horaria inválida no rompe nada: cae a UTC', async () => {
    const s = setup('Marte/Olympus');
    const out = await s.svc.catchUp(s.pet, NOW);
    expect(out.autonomyCursor).toBe(intervalIndex(NOW, cfg) - 1);
    expect(s.mind.applyExperience).toHaveBeenCalled();
  });
});
