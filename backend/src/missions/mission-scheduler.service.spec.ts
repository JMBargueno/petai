import { Test, TestingModule } from '@nestjs/testing';
import { MissionSchedulerService } from './mission-scheduler.service';
import { PrismaService } from '../prisma/prisma.service';
import { MissionGenerationService } from './mission-generation.service';

describe('MissionSchedulerService', () => {
  let service: MissionSchedulerService;
  let prisma: PrismaService;
  let generationService: MissionGenerationService;

  beforeEach(async () => {
    const mockPrisma = {
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1', timezone: 'UTC' }, { id: 'u2', timezone: 'America/New_York' }]) },
      mission: { deleteMany: jest.fn().mockResolvedValue({ count: 10 }) },
    };
    const mockGeneration = {
      generateDailyMissions: jest.fn().mockResolvedValue(true),
      generateWeeklyMissions: jest.fn().mockResolvedValue(true),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [MissionSchedulerService, { provide: PrismaService, useValue: mockPrisma }, { provide: MissionGenerationService, useValue: mockGeneration }],
    }).compile();
    service = module.get(MissionSchedulerService);
    prisma = module.get(PrismaService);
    generationService = module.get(MissionGenerationService);
  });

  it('handleDailyReset processes users in batches of 100', async () => {
    await service.handleDailyReset();
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
    expect(generationService.generateDailyMissions).toHaveBeenCalledTimes(2);
  });

  it('handleWeeklyReset processes users for weekly missions', async () => {
    await service.handleWeeklyReset();
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
    expect(generationService.generateWeeklyMissions).toHaveBeenCalledTimes(2);
  });

  it('does not duplicate missions (generation service checks existing)', async () => {
    (generationService.generateDailyMissions as jest.Mock).mockResolvedValue(false);
    await service.handleDailyReset();
    // Generation service handles the "already exists" check internally
    expect(generationService.generateDailyMissions).toHaveBeenCalledTimes(2);
  });

  it('cleanupExpiredMissions deletes missions older than 7 days', async () => {
    await service.cleanupExpiredMissions();
    const expectedCutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    expect(prisma.mission.deleteMany).toHaveBeenCalledWith({
      where: { periodEnd: { lt: expect.any(Date) } },
    });
    // Verify the cutoff is approximately 7 days ago
    const call = (prisma.mission.deleteMany as jest.Mock).mock.calls[0][0];
    const cutoff = call.where.periodEnd.lt;
    expect(Math.abs(cutoff.getTime() - expectedCutoff.getTime())).toBeLessThan(60000);
  });

  it('handles errors gracefully without throwing', async () => {
    (prisma.user.findMany as jest.Mock).mockRejectedValue(new Error('DB down'));
    await expect(service.handleDailyReset()).resolves.toBeUndefined();
    await expect(service.handleWeeklyReset()).resolves.toBeUndefined();
    await expect(service.cleanupExpiredMissions()).resolves.toBeUndefined();
  });
});
