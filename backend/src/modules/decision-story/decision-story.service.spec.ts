import * as fs from 'fs';
import * as path from 'path';
import { validateStoryData } from '../game-data/story-data.schemas';
import { DecisionStoryService } from './decision-story.service';

const dir = path.resolve(__dirname, '../../../../shared/game-data');
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, `${f}.json`), 'utf8'));
const storyData = validateStoryData({ stories: read('stories'), locations: read('story-locations'), seeds: read('story-seeds') }).data;
const seed = storyData.seeds[0];
const bestOf = (i: number) => seed.scenes[i].choices.findIndex((c) => c.score === 2);
const worstOf = (i: number) => seed.scenes[i].choices.reduce((w, c, k, all) => (c.score < all[w].score ? k : w), 0);

function build(opts: { plan?: 'free' | 'pro'; limit?: number; usedToday?: number; play?: any; closedAt?: Date | null; sleeping?: boolean } = {}) {
  const story = { id: 'story-1', day: '2026-03-02', slot: 0, title: seed.title, synopsis: seed.synopsis, scenes: { v: 1, scenes: seed.scenes }, closedAt: opts.closedAt ?? null, canon: null };
  let play = opts.play ? { id: 'play-1', userId: 'u1', petId: 'p1', storyId: story.id, status: 'active', outcome: null, score: null, xpAwarded: 0, coinsAwarded: 0, ...opts.play } : null;
  const tallies: any[] = [];
  const prisma: any = {
    decisionStory: {
      findUnique: jest.fn(async () => story),
      findFirst: jest.fn(async () => ({ day: story.day })),
    },
    decisionStoryPlay: {
      findUnique: jest.fn(async () => (play ? { ...play, story } : null)),
      count: jest.fn(async () => opts.usedToday ?? 0),
      create: jest.fn(async ({ data }: any) => (play = { id: 'play-1', status: 'active', outcome: null, score: null, xpAwarded: 0, coinsAwarded: 0, ...data })),
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (!play || play.status !== where.status || JSON.stringify(play.answers) !== JSON.stringify(where.answers.equals)) return { count: 0 };
        const { answers, ...rest } = data;
        play = { ...play, ...rest, answers: [...play.answers, answers.push] };
        return { count: 1 };
      }),
    },
    decisionStoryTally: {
      upsert: jest.fn(async ({ where }: any) => {
        const k = where.storyId_sceneIndex_optionIndex;
        const row = tallies.find((t) => t.sceneIndex === k.sceneIndex && t.optionIndex === k.optionIndex);
        if (row) row.count++;
        else tallies.push({ sceneIndex: k.sceneIndex, optionIndex: k.optionIndex, count: 1 });
      }),
      findMany: jest.fn(async ({ where }: any) => tallies.filter((t) => t.sceneIndex === where.sceneIndex)),
    },
    pet: { update: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn(async () => ({ id: 'p1' })) },
    user: { update: jest.fn() },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  const pets = { getPetById: jest.fn(async () => ({ id: 'p1', sleeping: opts.sleeping ?? false })), grantXp: jest.fn() };
  const entitlement = { planFor: jest.fn(async () => opts.plan ?? 'free') };
  const billingConfig = { limits: jest.fn(async () => ({ dailyStories: opts.limit ?? 1 })) };
  const dailyQuota = { day: jest.fn(async () => ({ key: 'k', rawKey: 'daily:u1:2026-03-02', resetsAt: '2026-03-03T00:00:00.000Z' })) };
  const realtime = { emitPetUpdate: jest.fn(), emitPetAction: jest.fn() };
  const events = { emit: jest.fn() };
  const svc = new DecisionStoryService(prisma, { getStoryData: () => storyData } as any, pets as any, entitlement as any, billingConfig as any, dailyQuota as any, realtime as any, events as any);
  return { svc, prisma, pets, events, realtime, tallies, getPlay: () => play };
}

describe('DecisionStoryService', () => {
  describe('start', () => {
    it('crea la partida con el día local y el número de orden, y no enseña la calidad de las opciones', async () => {
      const { svc, prisma } = build();
      const state = await svc.start('u1', 'story-1', 'p1');
      expect(prisma.decisionStoryPlay.create).toHaveBeenCalledWith({ data: { userId: 'u1', petId: 'p1', storyId: 'story-1', localDay: '2026-03-02', ordinal: 0, answers: [] } });
      expect(state).toMatchObject({ storyId: 'story-1', status: 'active', sceneIndex: 0, sceneCount: seed.scenes.length, result: null });
      expect(state.scene.choices).toHaveLength(seed.scenes[0].choices.length);
      expect(JSON.stringify(state)).not.toMatch(/"score":\d|canonLine/);
    });

    it('Free no puede empezar una segunda historia el mismo día', async () => {
      const { svc, prisma } = build({ usedToday: 1 });
      await expect(svc.start('u1', 'story-1', 'p1')).rejects.toMatchObject({ response: { code: 'daily_stories_exceeded', plan: 'free', limit: 1 } });
      expect(prisma.decisionStoryPlay.create).not.toHaveBeenCalled();
    });

    it('Pro puede empezar hasta su límite', async () => {
      const ok = build({ plan: 'pro', limit: 3, usedToday: 2 });
      await ok.svc.start('u1', 'story-1', 'p1');
      expect(ok.prisma.decisionStoryPlay.create.mock.calls[0][0].data.ordinal).toBe(2);
      await expect(build({ plan: 'pro', limit: 3, usedToday: 3 }).svc.start('u1', 'story-1', 'p1')).rejects.toMatchObject({ response: { code: 'daily_stories_exceeded' } });
    });

    it('retomar una historia ya empezada no gasta cupo', async () => {
      const { svc, prisma } = build({ usedToday: 1, play: { answers: [bestOf(0)] } });
      const state = await svc.start('u1', 'story-1', 'p1');
      expect(state.sceneIndex).toBe(1);
      expect(state.answered[0].consequence).toBe(seed.scenes[0].choices[bestOf(0)].consequence);
      expect(prisma.decisionStoryPlay.create).not.toHaveBeenCalled();
    });

    it('no deja empezar con la mascota dormida ni una historia de otro día', async () => {
      await expect(build({ sleeping: true }).svc.start('u1', 'story-1', 'p1')).rejects.toThrow('durmiendo');
      const old = build();
      old.prisma.decisionStory.findFirst.mockResolvedValue({ day: '2026-03-03' });
      await expect(old.svc.start('u1', 'story-1', 'p1')).rejects.toThrow('bucket de hoy');
    });
  });

  describe('answer', () => {
    it('devuelve la consecuencia, cuenta el voto y pasa a la escena siguiente', async () => {
      const { svc, tallies, pets, getPlay } = build({ play: { answers: [] } });
      const res = await svc.answer('u1', 'story-1', 0, bestOf(0));
      expect(res.consequence).toBe(seed.scenes[0].choices[bestOf(0)].consequence);
      expect(res.next.index).toBe(1);
      expect(res.completed).toBeNull();
      expect(res.community.total).toBe(1);
      expect(res.community.counts[bestOf(0)]).toBe(1);
      expect(tallies).toEqual([{ sceneIndex: 0, optionIndex: bestOf(0), count: 1 }]);
      expect(getPlay().answers).toEqual([bestOf(0)]);
      expect(pets.grantXp).not.toHaveBeenCalled();
    });

    it('en la última escena cierra la partida y reparte las recompensas de game-data', async () => {
      const { svc, prisma, pets, events, realtime, getPlay } = build({ play: { answers: [bestOf(0), bestOf(1)] } });
      const res = await svc.answer('u1', 'story-1', 2, bestOf(2));
      const win = storyData.config.rewards.win;
      expect(res.next).toBeNull();
      expect(res.completed).toMatchObject({ outcome: 'win', score: 1, rewards: win });
      expect(getPlay()).toMatchObject({ status: 'completed', outcome: 'win', xpAwarded: win.xp, coinsAwarded: win.coins });
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { coins: { increment: win.coins } } });
      expect(prisma.pet.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { happiness: { increment: win.happiness } } });
      expect(pets.grantXp).toHaveBeenCalledWith('u1', 'p1', win.xp);
      expect(events.emit).toHaveBeenCalledWith('adventure:finished', { userId: 'u1', petId: 'p1', theme: seed.title, outcome: 'win' });
      expect(realtime.emitPetAction).toHaveBeenCalledWith('u1', 'p1', 'adventure', { result: 'win' });
    });

    it('malas decisiones dan el resultado y la recompensa de derrota', async () => {
      const { svc } = build({ play: { answers: [worstOf(0), worstOf(1)] } });
      const res = await svc.answer('u1', 'story-1', 2, worstOf(2));
      expect(res.completed.outcome).not.toBe('win');
    });

    it('rechaza una escena que no toca, una opción inexistente y una historia terminada', async () => {
      await expect(build({ play: { answers: [0] } }).svc.answer('u1', 'story-1', 0, 0)).rejects.toThrow('ya está respondida');
      await expect(build({ play: { answers: [] } }).svc.answer('u1', 'story-1', 0, 9)).rejects.toThrow('Opción inválida');
      await expect(build({ play: { answers: [0, 0, 0], status: 'completed' } }).svc.answer('u1', 'story-1', 3, 0)).rejects.toThrow('ya ha terminado');
      await expect(build().svc.answer('u1', 'story-1', 0, 0)).rejects.toThrow('No has empezado');
    });

    it('dos respuestas simultáneas a la misma escena: solo cuenta una y no se premia dos veces', async () => {
      const { svc, prisma, pets } = build({ play: { answers: [bestOf(0), bestOf(1)] } });
      // La segunda petición leyó la partida antes de que la primera la cerrase
      prisma.decisionStoryPlay.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(svc.answer('u1', 'story-1', 2, bestOf(2))).rejects.toThrow('ya está respondida');
      expect(prisma.decisionStoryTally.upsert).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(pets.grantXp).not.toHaveBeenCalled();
    });

    it('con el día ya cerrado se puede seguir jugando, pero el voto no cuenta', async () => {
      const { svc, prisma } = build({ play: { answers: [] }, closedAt: new Date() });
      const res = await svc.answer('u1', 'story-1', 0, 0);
      expect(res.next.index).toBe(1);
      expect(prisma.decisionStoryTally.upsert).not.toHaveBeenCalled();
    });
  });
});
