import { BadRequestException, Injectable } from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { GameDataService } from '../game-data/game-data.service';

export interface DevSeedRequest {
  /** Nº de usuarios a crear (>= 0). */
  users: number;
  /** Nº de mascotas a crear (>= 0). */
  pets: number;
  /** Rango de nivel (default 1..10). */
  level?: { min: number; max: number };
  /** Si `true`, no persiste; devuelve el plan. */
  dryRun?: boolean;
}

export interface DevSeedResult {
  usersCreated: number;
  petsCreated: number;
  durationMs: number;
  dryRun: boolean;
  distribution?: { byRarity: Record<string, number>; byLevel: Record<number, number> };
}

interface PetPlanItem {
  speciesId: string;
  rarity: string;
  level: number;
}

@Injectable()
export class DevSeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
  ) {}

  async seed(req: DevSeedRequest): Promise<DevSeedResult> {
    const started = Date.now();
    const users = this.ensureInt(req?.users, 'users');
    const pets = this.ensureInt(req?.pets, 'pets');
    const level = this.ensureLevel(req?.level);
    const dryRun = Boolean(req?.dryRun);

    const species = this.gameData.getSpecies();
    const patterns = this.gameData.getPatterns();
    if (!dryRun && (species.length === 0 || patterns.length === 0)) {
      throw new BadRequestException('No hay especies/patrones cargados para crear mascotas');
    }

    const plan = this.buildPetPlan(pets, species, level);
    const distribution = this.computeDistribution(plan);

    if (dryRun) {
      return { usersCreated: users, petsCreated: pets, durationMs: Date.now() - started, dryRun, distribution };
    }

    await this.prisma.$transaction(async (tx) => {
      const userIds: string[] = [];
      for (let i = 0; i < users; i++) {
        const u = await tx.user.create({
          data: {
            email: `seed_${randomUUID()}@petai.dev`,
            passwordHash: 'seed-no-password',
            displayName: `Seed User ${i + 1}`,
            coins: 100,
            gems: 5,
          },
        });
        userIds.push(u.id);
      }
      // Si piden mascotas sin usuarios, se crea un dueño implícito para poder asociarlas.
      if (userIds.length === 0 && plan.length > 0) {
        const owner = await tx.user.create({
          data: {
            email: `seed_owner_${randomUUID()}@petai.dev`,
            passwordHash: 'seed-no-password',
            displayName: 'Seed Owner',
            coins: 0,
            gems: 0,
          },
        });
        userIds.push(owner.id);
      }

      if (plan.length === 0) return;

      const petData = plan.map((p, i) => {
        const sp = species.find((s) => s.id === p.speciesId) ?? species[0];
        const pattern = patterns[randomInt(patterns.length)];
        const ownerId = userIds[randomInt(userIds.length)];
        return {
          userId: ownerId,
          speciesId: sp.id,
          rarity: p.rarity,
          patternId: pattern.id,
          palette: (sp.defaultPalette ?? {}) as object,
          shiny: randomInt(100) < 2,
          visualSeed: randomInt(2 ** 31),
          nickname: `${sp.name} ${i + 1}`,
          level: p.level,
          xp: 0,
          stage: 'baby',
          combatStats: { ...(sp.baseStats ?? {}), allocated: { hp: 0, atk: 0, def: 0, vel: 0, esp: 0 } } as object,
          statPoints: 0,
          skills: [] as unknown as object,
        };
      });
      await tx.pet.createMany({ data: petData });
    });

    return { usersCreated: users, petsCreated: pets, durationMs: Date.now() - started, dryRun, distribution };
  }

  private ensureInt(value: unknown, name: string): number {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(n) || n < 0) throw new BadRequestException(`${name} debe ser un entero >= 0`);
    return n;
  }

  private ensureLevel(level?: { min?: number; max?: number }): { min: number; max: number } {
    const min = level?.min ?? 1;
    const max = level?.max ?? 10;
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) {
      throw new BadRequestException('level debe ser { min, max } con enteros, min >= 1 y max >= min');
    }
    return { min, max };
  }

  /** Plan de mascotas: especie (uniforme) + nivel (uniforme en el rango). Aleatoriedad con `crypto`. */
  private buildPetPlan(pets: number, species: any[], level: { min: number; max: number }): PetPlanItem[] {
    const out: PetPlanItem[] = [];
    for (let i = 0; i < pets; i++) {
      const sp = species[randomInt(species.length)];
      const lvl = level.min + randomInt(level.max - level.min + 1);
      out.push({ speciesId: sp.id, rarity: sp.rarity, level: lvl });
    }
    return out;
  }

  private computeDistribution(plan: PetPlanItem[]) {
    const byRarity: Record<string, number> = {};
    const byLevel: Record<number, number> = {};
    for (const p of plan) {
      byRarity[p.rarity] = (byRarity[p.rarity] ?? 0) + 1;
      byLevel[p.level] = (byLevel[p.level] ?? 0) + 1;
    }
    return { byRarity, byLevel };
  }
}