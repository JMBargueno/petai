import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProfileService } from './profile.service';

const R = { coins: 0, gems: 0, xp: 0, itemId: null };
const DEFS = [
  { id: 'beta', name: 'Beta', desc: 'Beta', category: 'special', target: 1, tier: 'legendary', badge: { icon: 'flask-conical' }, reward: R },
  { id: 'feed_10', name: 'Feed', desc: 'Feed', category: 'care', target: 10, tier: 'common', badge: { icon: 'apple' }, reward: R },
];

function build(opts: { achievementsPublic?: boolean; friends?: boolean } = {}) {
  const user = {
    id: 'u2',
    email: 'secreto@example.com',
    displayName: 'Otro',
    handle: 'otro',
    title: null,
    accountXp: 50,
    createdAt: new Date('2026-05-01'),
    achievementsPublic: opts.achievementsPublic ?? true,
    featuredBadges: ['beta', 'feed_10'],
    coins: 999,
  };
  const prisma: any = {
    user: {
      findUnique: jest.fn(async ({ select }: any) => {
        // Solo devuelve los campos pedidos: así el test detecta fugas (email, coins...).
        const out: any = {};
        for (const k of Object.keys(select)) out[k] = (user as any)[k];
        return out;
      }),
      update: jest.fn(async ({ data }: any) => ({ featuredBadges: data.featuredBadges })),
    },
    pet: { findFirst: jest.fn().mockResolvedValue(null) },
    achievement: {
      findMany: jest.fn(async ({ where }: any) => {
        const rows = [{ achId: 'beta', unlockedAt: new Date('2026-11-17') }];
        return where.achId?.in ? rows.filter((r) => where.achId.in.includes(r.achId)) : rows;
      }),
    },
    coopFriendship: { findFirst: jest.fn().mockResolvedValue(opts.friends ? { id: 'f' } : null) },
  };
  const stats: any = {
    getAll: jest.fn().mockResolvedValue({ feeds: 4, play_seconds: 600, coins_spent: 300 }),
    getProInfo: jest.fn().mockResolvedValue({ days: 0, active: false, since: null }),
  };
  const engine: any = {
    getDefs: () => DEFS,
    loadContext: jest.fn().mockResolvedValue({ stats: { feeds: 4, coins_spent: 300 }, createdAt: user.createdAt }),
    evaluate: jest.fn().mockResolvedValue([]),
  };
  return { svc: new ProfileService(prisma, stats, engine), prisma, engine };
}

describe('ProfileService', () => {
  it('perfil público: insignias, destacadas desbloqueadas y stats sin datos privados', async () => {
    const { svc } = build({ friends: true });
    const p = await svc.getPublicProfile('u1', 'u2');
    expect(p.badges.map((b) => b.id)).toEqual(['beta']);
    expect(p.badges[0].badgeIcon).toBe('flask-conical');
    expect(p.featuredBadges).toEqual(['beta']); // feed_10 no está desbloqueado
    expect(p.stats?.playMinutes).toBe(10);
    expect(p.stats?.coinsSpent).toBeUndefined();
    expect(p.isFriend).toBe(true);
    expect(p.isSelf).toBe(false);
    expect(p).not.toHaveProperty('email');
    expect(p).not.toHaveProperty('coins');
  });

  it('perfil público oculto: sin insignias ni estadísticas', async () => {
    const { svc } = build({ achievementsPublic: false });
    const p = await svc.getPublicProfile('u1', 'u2');
    expect(p.badges).toEqual([]);
    expect(p.featuredBadges).toEqual([]);
    expect(p.stats).toBeNull();
  });

  it('perfil propio: evalúa logros y muestra el gasto', async () => {
    const { svc, engine } = build();
    const p = await svc.getMyProfile('u2');
    expect(engine.evaluate).toHaveBeenCalled();
    expect(p.stats?.coinsSpent).toBe(300);
    expect(p.achievementCount).toEqual({ unlocked: 1, total: 2 });
  });

  it('404 si el usuario no existe', async () => {
    const { svc, prisma } = build();
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(svc.getPublicProfile('u1', 'nadie')).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('setFeaturedBadges', () => {
    it('guarda hasta 3 insignias desbloqueadas', async () => {
      const { svc } = build();
      await expect(svc.setFeaturedBadges('u2', { achIds: ['beta', 'beta'] })).resolves.toEqual({ featuredBadges: ['beta'] });
    });

    it('rechaza insignias no desbloqueadas, más de 3 o formato inválido', async () => {
      const { svc } = build();
      await expect(svc.setFeaturedBadges('u2', { achIds: ['feed_10'] })).rejects.toBeInstanceOf(BadRequestException);
      await expect(svc.setFeaturedBadges('u2', { achIds: ['a', 'b', 'c', 'd'] })).rejects.toBeInstanceOf(BadRequestException);
      await expect(svc.setFeaturedBadges('u2', { achIds: 'beta' })).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
