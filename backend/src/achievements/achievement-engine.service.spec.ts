import { AchievementEngineService, AchievementDef, computeProgress } from './achievement-engine.service';
import { achievementsSchema, validateGameData } from '../modules/game-data/game-data.schemas';

const R = { coins: 10, gems: 0, xp: 5, itemId: null };
const DEFS: AchievementDef[] = [
  { id: 'feed_10', name: 'F', desc: 'F', category: 'care', target: 10, trigger: { type: 'stat', stat: 'feeds' }, tier: 'common', badge: { icon: 'apple' }, reward: R },
  { id: 'beta', name: 'B', desc: 'B', category: 'special', target: 1, trigger: { type: 'account_before', date: '2027-01-01' }, tier: 'legendary', badge: { icon: 'flask-conical' }, reward: R },
  { id: 'all_r', name: 'A', desc: 'A', category: 'collection', target: 2, trigger: { type: 'all_stats', stats: ['hatched_rare', 'hatched_mythic'] }, tier: 'epic', badge: { icon: 'library' }, reward: R },
  { id: 'evt', name: 'E', desc: 'E', category: 'battle', target: 1, event: 'battle_win', tier: 'common', badge: { icon: 'trophy' }, reward: R },
];

describe('computeProgress', () => {
  it('stat: valor de la estadística', () => {
    expect(computeProgress(DEFS[0], { stats: { feeds: 7 }, createdAt: null })).toBe(7);
    expect(computeProgress(DEFS[0], { stats: {}, createdAt: null })).toBe(0);
  });

  it('account_before: cumple solo si la cuenta es anterior a la fecha', () => {
    expect(computeProgress(DEFS[1], { stats: {}, createdAt: new Date('2026-11-01') })).toBe(1);
    expect(computeProgress(DEFS[1], { stats: {}, createdAt: new Date('2027-01-01T00:00:00Z') })).toBe(0);
  });

  it('all_stats: cuántas estadísticas alcanzan el mínimo', () => {
    expect(computeProgress(DEFS[2], { stats: { hatched_rare: 3 }, createdAt: null })).toBe(1);
    expect(computeProgress(DEFS[2], { stats: { hatched_rare: 1, hatched_mythic: 1 }, createdAt: null })).toBe(2);
  });
});

describe('AchievementEngineService.evaluate', () => {
  function build(unlocked: string[] = [], grant = true) {
    const prisma: any = {
      achievement: {
        findMany: jest.fn().mockResolvedValue(unlocked.map((achId) => ({ achId }))),
        upsert: jest.fn(),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ createdAt: new Date('2026-06-01') }) },
    };
    const gameData: any = { getAchievements: () => ({ achievements: DEFS }) };
    const stats: any = { getAll: jest.fn().mockResolvedValue({ feeds: 12, hatched_rare: 1 }) };
    const rewards: any = {
      unlockAndGrant: jest.fn(async (_u: string, id: string) => (grant ? { id, name: id, category: 'x', tier: 'common', reward: R } : null)),
      emitUnlocked: jest.fn(),
    };
    return { svc: new AchievementEngineService(prisma, gameData, stats, rewards), prisma, rewards };
  }

  it('desbloquea los logros cumplidos (stat y account_before) y no los de evento', async () => {
    const { svc, prisma, rewards } = build();
    const newly = await svc.evaluate('u1');
    expect(newly.sort()).toEqual(['beta', 'feed_10']);
    expect(prisma.achievement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { userId: 'u1', achId: 'feed_10', current: 10 } }),
    );
    expect(rewards.unlockAndGrant).not.toHaveBeenCalledWith('u1', 'evt');
    expect(rewards.unlockAndGrant).not.toHaveBeenCalledWith('u1', 'all_r');
    expect(rewards.emitUnlocked).toHaveBeenCalledTimes(2);
  });

  it('con claves cambiadas solo evalúa los logros que dependen de ellas', async () => {
    const { svc, rewards } = build();
    await expect(svc.evaluate('u1', undefined, ['play_seconds'])).resolves.toEqual([]);
    expect(rewards.unlockAndGrant).not.toHaveBeenCalled();
    await expect(svc.evaluate('u1', undefined, ['feeds'])).resolves.toEqual(['feed_10']);
  });

  it('ignora los ya desbloqueados', async () => {
    const { svc, rewards } = build(['beta', 'feed_10']);
    await expect(svc.evaluate('u1')).resolves.toEqual([]);
    expect(rewards.unlockAndGrant).not.toHaveBeenCalled();
  });

  it('si otra evaluación concurrente ya lo desbloqueó, no re-emite', async () => {
    const { svc, rewards } = build([], false);
    await expect(svc.evaluate('u1')).resolves.toEqual([]);
    expect(rewards.emitUnlocked).not.toHaveBeenCalled();
  });
});

describe('achievements.json (shared/game-data)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const data = require('../../../shared/game-data/achievements.json');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const constellations = require('../../../shared/game-data/constellations.json');

  it('cumple el schema (insignia en todos los logros, trigger o evento)', () => {
    expect(achievementsSchema.safeParse(data).success).toBe(true);
    for (const a of data.achievements) expect(a.badge?.icon).toEqual(expect.any(String));
  });

  it('pasa la integridad cruzada (estadísticas conocidas, all_stats, constelaciones)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const balance = require('../../../shared/game-data/balance.json');
    const errors = validateGameData({ balance, achievements: data, constellations } as any).filter((e: string) => /Logro|Constelación/.test(e));
    expect(errors).toEqual([]);
  });

  it('incluye los logros de beta tester, tiempo, PRO, rachas, rarezas y gasto', () => {
    const ids = new Set(data.achievements.map((a: any) => a.id));
    for (const id of ['special_beta_tester', 'time_1h', 'pro_30d', 'streak_7', 'rarity_mythic', 'rarity_all', 'spend_1k', 'care_feed_1000']) {
      expect(ids.has(id)).toBe(true);
    }
  });
});
