import { Test, TestingModule } from '@nestjs/testing';
import { AchievementRewardsService } from './achievement-rewards.service';
import { PrismaService } from '../prisma/prisma.service';
import { GameDataService } from '../modules/game-data/game-data.service';
import { RealtimeGateway } from '../modules/realtime/realtime.gateway';
import { InventoryService } from '../modules/inventory/inventory.service';

const DEFS = [
  { id: 'battle_50_wins', name: 'Dominador', category: 'battle', target: 50, tier: 'epic', reward: { coins: 600, gems: 5, xp: 250, itemId: 'ach_item_battle_trophy' } },
  { id: 'care_feed_10', name: 'Primer bocadillo', category: 'care', target: 10, tier: 'common', reward: { coins: 50, gems: 0, xp: 20, itemId: null } },
];

describe('AchievementRewardsService', () => {
  let service: AchievementRewardsService;
  let prisma: PrismaService;
  let inventoryService: InventoryService;
  let realtime: RealtimeGateway;
  let tx: any;
  const userId = 'user-1';

  beforeEach(async () => {
    tx = {
      achievement: { updateMany: jest.fn() },
      user: { update: jest.fn().mockResolvedValue({}) },
    };
    const mockPrisma = { $transaction: jest.fn().mockImplementation((cb) => cb(tx)) };
    const mockGame = { getAchievements: jest.fn().mockReturnValue({ version: 'v1', achievements: DEFS }) };
    const mockRealtime = { emitToUser: jest.fn() };
    const mockInventory = { grantExclusiveItem: jest.fn().mockResolvedValue({}) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AchievementRewardsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GameDataService, useValue: mockGame },
        { provide: RealtimeGateway, useValue: mockRealtime },
        { provide: InventoryService, useValue: mockInventory },
      ],
    }).compile();
    service = module.get(AchievementRewardsService);
    prisma = module.get(PrismaService);
    inventoryService = module.get(InventoryService);
    realtime = module.get(RealtimeGateway);
  });

  it('unlocks atomically, credits coins/gems/xp and grants the exclusive item', async () => {
    (tx.achievement.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    const payload = await service.unlockAndGrant(userId, 'battle_50_wins');
    expect(payload).toEqual(
      expect.objectContaining({ id: 'battle_50_wins', reward: expect.objectContaining({ itemId: 'ach_item_battle_trophy' }) }),
    );
    expect(tx.achievement.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId, achId: 'battle_50_wins', unlockedAt: null, current: { gte: 50 } } }),
    );
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: userId },
      data: { coins: { increment: 600 }, gems: { increment: 5 }, accountXp: { increment: 250 } },
    });
    expect(inventoryService.grantExclusiveItem).toHaveBeenCalledWith(userId, 'ach_item_battle_trophy', tx);
  });

  it('does NOT grant an item for logros without itemId', async () => {
    (tx.achievement.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    await service.unlockAndGrant(userId, 'care_feed_10');
    expect(inventoryService.grantExclusiveItem).not.toHaveBeenCalled();
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ coins: { increment: 50 } }) }),
    );
  });

  it('is a no-op (returns null) when the logro was already unlocked', async () => {
    (tx.achievement.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    const payload = await service.unlockAndGrant(userId, 'battle_50_wins');
    expect(payload).toBeNull();
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(inventoryService.grantExclusiveItem).not.toHaveBeenCalled();
  });

  it('returns null for an unknown logro id', async () => {
    const payload = await service.unlockAndGrant(userId, 'does_not_exist');
    expect(payload).toBeNull();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('race condition: two concurrent unlocks credit the reward exactly once', async () => {
    (tx.achievement.updateMany as jest.Mock)
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const [first, second] = await Promise.all([
      service.unlockAndGrant(userId, 'battle_50_wins'),
      service.unlockAndGrant(userId, 'battle_50_wins'),
    ]);
    expect(first).toEqual(expect.objectContaining({ id: 'battle_50_wins' }));
    expect(second).toBeNull();
    expect(tx.user.update).toHaveBeenCalledTimes(1);
    expect(inventoryService.grantExclusiveItem).toHaveBeenCalledTimes(1);
  });

  it('emits the unlocked payload to the user via WebSocket', async () => {
    (tx.achievement.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    const payload = { id: 'care_feed_10', name: 'Primer bocadillo', category: 'care', tier: 'common', reward: DEFS[1].reward };
    service.emitUnlocked(userId, payload);
    expect(realtime.emitToUser).toHaveBeenCalledWith(userId, 'achievement:unlocked', expect.objectContaining({ id: 'care_feed_10' }));
  });
});
