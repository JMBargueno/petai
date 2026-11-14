import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GeneticsEngineService, PetGenes } from './genetics-engine.service';

const BREEDING_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_SIMULTANEOUS = 3;
const COOLDOWN_MS = 1 * 60 * 60 * 1000; // 1 hour

@Injectable()
export class BreedingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geneticsEngine: GeneticsEngineService,
  ) {}

  async startBreeding(userId: string, parent1Id: string, parent2Id: string) {
    const parent1 = await this.prisma.pet.findFirst({ where: { id: parent1Id, userId } });
    if (!parent1) throw new NotFoundException('Parent 1 not found or not owned');

    const parent2 = await this.prisma.pet.findFirst({ where: { id: parent2Id, userId } });
    if (!parent2) throw new NotFoundException('Parent 2 not found or not owned');

    if (parent1Id === parent2Id) {
      throw new BadRequestException('Cannot breed a pet with itself');
    }

    const activeBreedings = await this.prisma.breeding.count({
      where: { userId, status: 'in_progress' },
    });
    if (activeBreedings >= MAX_SIMULTANEOUS) {
      throw new BadRequestException(`Maximum ${MAX_SIMULTANEOUS} simultaneous breedings`);
    }

    const now = Date.now();
    for (const parentId of [parent1Id, parent2Id]) {
      const lastBreeding = await this.prisma.breeding.findFirst({
        where: {
          OR: [{ parent1Id: parentId }, { parent2Id: parentId }],
          status: 'completed',
        },
        orderBy: { completesAt: 'desc' },
      });
      if (lastBreeding && now - lastBreeding.completesAt.getTime() < COOLDOWN_MS) {
        const remaining = Math.ceil((COOLDOWN_MS - (now - lastBreeding.completesAt.getTime())) / 60000);
        throw new BadRequestException(`Pet on cooldown. Try again in ${remaining} min`);
      }
    }

    const completesAt = new Date(now + BREEDING_DURATION_MS);
    const breeding = await this.prisma.breeding.create({
      data: { userId, parent1Id, parent2Id, status: 'in_progress', completesAt, seed: 0 },
    });

    return {
      id: breeding.id,
      status: breeding.status,
      parent1: { id: parent1.id, nickname: parent1.nickname, speciesId: parent1.speciesId },
      parent2: { id: parent2.id, nickname: parent2.nickname, speciesId: parent2.speciesId },
      startedAt: breeding.startedAt,
      completesAt,
      estimatedMinutes: BREEDING_DURATION_MS / 60000,
    };
  }

  async getBreeding(userId: string, breedingId: string) {
    const breeding = await this.prisma.breeding.findFirst({
      where: { id: breedingId, userId },
      include: {
        parent1: { select: { id: true, nickname: true, speciesId: true } },
        parent2: { select: { id: true, nickname: true, speciesId: true } },
        result: true,
      },
    });
    if (!breeding) throw new NotFoundException('Breeding not found');

    const result = await this.checkAndComplete(breeding);
    return {
      id: breeding.id,
      status: breeding.status,
      parent1: { id: breeding.parent1Id, nickname: breeding.parent1.nickname },
      parent2: { id: breeding.parent2Id, nickname: breeding.parent2.nickname },
      startedAt: breeding.startedAt,
      completesAt: breeding.completesAt,
      timeRemainingMs: Math.max(0, breeding.completesAt.getTime() - Date.now()),
      result,
    };
  }

  async getHistory(userId: string) {
    const breedings = await this.prisma.breeding.findMany({
      where: { userId },
      include: {
        parent1: { select: { id: true, nickname: true } },
        parent2: { select: { id: true, nickname: true } },
        result: true,
      },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
    return breedings.map((b) => ({
      id: b.id,
      status: b.status,
      parent1: { id: b.parent1Id, nickname: b.parent1.nickname },
      parent2: { id: b.parent2Id, nickname: b.parent2.nickname },
      startedAt: b.startedAt,
      completesAt: b.completesAt,
      result: b.result
        ? { offspringId: b.result.offspringId, mutations: b.result.mutations }
        : null,
    }));
  }

  private async checkAndComplete(breeding: {
    id: string;
    status: string;
    parent1Id: string;
    parent2Id: string;
    userId: string;
    completesAt: Date;
  }) {
    if (breeding.status === 'completed') {
      return this.prisma.breedingResult.findUnique({
        where: { breedingId: breeding.id },
      });
    }
    if (Date.now() < breeding.completesAt.getTime()) return null;

    const parent1 = await this.prisma.pet.findUnique({
      where: { id: breeding.parent1Id },
      include: { species: true },
    });
    const parent2 = await this.prisma.pet.findUnique({
      where: { id: breeding.parent2Id },
      include: { species: true },
    });
    if (!parent1 || !parent2) throw new NotFoundException('Parent pet gone');

    const g1: PetGenes = {
      element: parent1.species?.element || 'fire',
      rarity: parent1.rarity,
      patternId: parent1.patternId,
      palette: parent1.palette as Record<string, string>,
      baseStats: (parent1.species?.baseStats as Record<string, number>) || {},
      shiny: parent1.shiny,
    };
    const g2: PetGenes = {
      element: parent2.species?.element || 'fire',
      rarity: parent2.rarity,
      patternId: parent2.patternId,
      palette: parent2.palette as Record<string, string>,
      baseStats: (parent2.species?.baseStats as Record<string, number>) || {},
      shiny: parent2.shiny,
    };

    const result = this.geneticsEngine.computeOffspring(g1, g2);

    const offspring = await this.prisma.pet.create({
      data: {
        userId: breeding.userId,
        speciesId: parent1.speciesId,
        rarity: result.offspringGenes.rarity,
        patternId: result.offspringGenes.patternId,
        palette: result.offspringGenes.palette,
        shiny: result.offspringGenes.shiny,
        visualSeed: result.seed,
        nickname: `Offspring ${result.seed}`,
        level: 1,
        xp: 0,
        stage: 'baby',
        combatStats: result.offspringGenes.baseStats,
      },
    });

    const breedingResult = await this.prisma.breedingResult.create({
      data: {
        breedingId: breeding.id,
        offspringId: offspring.id,
        inheritedGenes: result.inheritedGenes,
        mutations: result.mutations,
      },
    });

    await this.prisma.breeding.update({
      where: { id: breeding.id },
      data: { status: 'completed', seed: result.seed },
    });

    return breedingResult;
  }
}