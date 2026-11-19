import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LearningService } from './learning.service';

const balance = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../shared/game-data/balance.json'), 'utf8'));
const cfg = balance.personality.learning;
const NOW = new Date('2026-11-19T09:00:00Z');

function setup(personality: Record<string, unknown> = {}, found = true) {
  const row: any = { id: 'pet-1', userId: 'u1', personality };
  const prisma: any = { pet: { findFirst: jest.fn(async () => (found ? row : null)) } };
  const mind: any = {
    config: () => balance.personality,
    ensureDims: jest.fn(async (pet: any) => ({ dims: {}, stored: pet.personality })),
    patchStored: jest.fn(async (_id: string, patch: any) => Object.assign(row.personality, patch)),
  };
  return { svc: new LearningService(prisma, mind), row, mind };
}

describe('LearningService', () => {
  it('premiar una conducta sube su preferencia y se guarda', async () => {
    const { svc, row } = setup();
    const r = await svc.reinforce('u1', 'pet-1', { behavior: 'dance', signal: 'pet' }, NOW);
    expect(r.applied).toBe(true);
    expect(r.prefs.dance).toBeGreaterThan(0);
    expect((row.personality.learned as any).prefs.dance).toBe(r.prefs.dance);
    expect(svc.view(row.personality, NOW).prefs.dance).toBe(r.prefs.dance);
  });

  it('apartarlo baja la preferencia', async () => {
    const { svc } = setup();
    const r = await svc.reinforce('u1', 'pet-1', { behavior: 'climb', signal: 'pickup' }, NOW);
    expect(r.prefs.climb).toBeLessThan(0);
  });

  it('rechaza conductas y gestos inventados, y mascotas ajenas', async () => {
    const { svc } = setup();
    await expect(svc.reinforce('u1', 'pet-1', { behavior: 'borrar_disco', signal: 'pet' }, NOW)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.reinforce('u1', 'pet-1', { behavior: 'dance', signal: 'x' }, NOW)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.reinforce('u1', 'pet-1', { behavior: 7 as any, signal: 'pet' }, NOW)).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup({}, false).svc.reinforce('u2', 'pet-1', { behavior: 'dance', signal: 'pet' }, NOW)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('pasado el tope diario responde sin aplicar, nunca con error', async () => {
    const { svc } = setup();
    let applied = 0;
    for (let i = 0; i < cfg.dailyCap + 5; i++) {
      const r = await svc.reinforce('u1', 'pet-1', { behavior: 'dance', signal: 'click' }, new Date(NOW.getTime() + i * 1000));
      if (r.applied) applied++;
      else expect(r.reason).toBe('daily_cap');
    }
    expect(applied).toBe(cfg.dailyCap);
  });

  it('ignora lo guardado que no reconoce', () => {
    const { svc } = setup();
    expect(svc.view({ learned: { prefs: { dance: 0.5, inventada: 1, rota: 'x' }, at: NOW.getTime() } } as any, NOW).prefs).toEqual({ dance: 0.5 });
  });
});
