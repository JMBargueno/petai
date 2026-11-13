import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { GameDataService } from '../game-data/game-data.service';

@Injectable()
export class HatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
  ) {}

  async getEggs(userId: string) {
    return this.prisma.egg.findMany({
      where: { userId, hatchedPetId: null },
      orderBy: { startedAt: 'asc' },
    });
  }

  async buyEgg(userId: string, eggType: string = 'standard') {
    const costCoins = 50;
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.coins < costCoins) {
      throw new BadRequestException('Monedas insuficientes para comprar un huevo');
    }

    const now = new Date();
    // 5 minutos de incubación para standard
    const hatchesAt = new Date(now.getTime() + 5 * 60 * 1000);

    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { coins: { decrement: costCoins } },
      });

      return tx.egg.create({
        data: {
          userId,
          eggType,
          startedAt: now,
          hatchesAt,
        },
      });
    });
  }

  async hatchEgg(userId: string, eggId: string) {
    const egg = await this.prisma.egg.findFirst({
      where: { id: eggId, userId, hatchedPetId: null },
    });

    if (!egg) {
      throw new NotFoundException('Huevo no encontrado o ya eclosionado');
    }

    if (new Date() < egg.hatchesAt) {
      const remainingSeconds = Math.ceil((egg.hatchesAt.getTime() - Date.now()) / 1000);
      throw new BadRequestException(`El huevo aún está incubando. Faltan ${remainingSeconds} segundos.`);
    }

    let pity = await this.prisma.pityCounter.findUnique({ where: { userId } });
    if (!pity) {
      pity = await this.prisma.pityCounter.create({
        data: { userId, sinceSuperRare: 0, sinceLegendary: 0 },
      });
    }

    // Determinación autoritativa de rareza
    const rolledRarity = this.rollRarity(pity.sinceSuperRare, pity.sinceLegendary);

    // Actualización de Pity
    let newSinceSuper = pity.sinceSuperRare + 1;
    let newSinceLeg = pity.sinceLegendary + 1;

    if (['super_rare', 'legendary', 'mythic'].includes(rolledRarity)) {
      newSinceSuper = 0;
    }
    if (['legendary', 'mythic'].includes(rolledRarity)) {
      newSinceLeg = 0;
    }

    // Selección de especie
    const allSpecies = this.gameData.getSpecies();
    let eligibleSpecies = allSpecies.filter((s: any) => s.rarity === rolledRarity);
    if (eligibleSpecies.length === 0) {
      eligibleSpecies = allSpecies; // Fallback
    }
    const chosenSpecies = eligibleSpecies[crypto.randomInt(0, eligibleSpecies.length)];

    // Selección de patrón cosmético
    const allPatterns = this.gameData.getPatterns();
    const rarityRanks: Record<string, number> = {
      normal: 1,
      rare: 2,
      super_rare: 3,
      legendary: 4,
      mythic: 5,
    };
    const rolledRank = rarityRanks[rolledRarity] || 1;
    const eligiblePatterns = allPatterns.filter((p: any) => (rarityRanks[p.minRarity] || 1) <= rolledRank);
    const chosenPattern = eligiblePatterns[crypto.randomInt(0, eligiblePatterns.length)];

    // Tirada de Shiny (2%)
    const isShiny = crypto.randomInt(0, 100) < 2;

    // Semilla visual determinista
    const visualSeed = crypto.randomInt(1, 2147483647);

    // Multiplicador de combate según rareza
    const balance = this.gameData.getBalance();
    const rarityMultiplier = balance.rarity[rolledRarity]?.multiplier || 1.0;

    const baseCombat = chosenSpecies.baseStats;
    const initialCombatStats = {
      hp: Math.round(baseCombat.hp * rarityMultiplier),
      atk: Math.round(baseCombat.atk * rarityMultiplier),
      def: Math.round(baseCombat.def * rarityMultiplier),
      vel: Math.round(baseCombat.vel * rarityMultiplier),
      esp: Math.round(baseCombat.esp * rarityMultiplier),
    };

    const palette = isShiny
      ? {
          primary: '#FFD700',
          secondary: '#FFFFFF',
          accent: '#FF4500',
        }
      : chosenSpecies.defaultPalette;

    return this.prisma.$transaction(async (tx) => {
      await tx.pityCounter.update({
        where: { userId },
        data: {
          sinceSuperRare: newSinceSuper,
          sinceLegendary: newSinceLeg,
        },
      });

      const pet = await tx.pet.create({
        data: {
          userId,
          speciesId: chosenSpecies.id,
          rarity: rolledRarity,
          patternId: chosenPattern.id,
          palette,
          shiny: isShiny,
          visualSeed,
          nickname: chosenSpecies.name,
          level: 1,
          xp: 0,
          stage: 'baby',
          hunger: 100,
          happiness: 100,
          energy: 100,
          hygiene: 100,
          health: 100,
          combatStats: initialCombatStats,
          statPoints: 0,
          skills: [],
          personality: {
            trait: 'curioso',
            temperament: 'alegre',
          },
          lastTickAt: new Date(),
        },
        include: {
          species: true,
          pattern: true,
        },
      });

      await tx.egg.update({
        where: { id: eggId },
        data: { hatchedPetId: pet.id },
      });

      return pet;
    });
  }

  private rollRarity(sinceSuperRare: number, sinceLegendary: number): string {
    // Reglas de Pity
    if (sinceLegendary >= 119) {
      return crypto.randomInt(0, 100) < 20 ? 'mythic' : 'legendary';
    }
    if (sinceSuperRare >= 29) {
      const roll = crypto.randomInt(0, 100);
      if (roll < 70) return 'super_rare';
      if (roll < 95) return 'legendary';
      return 'mythic';
    }

    // Tirada estocástica estándar (0..9999)
    const roll = crypto.randomInt(0, 10000);
    if (roll < 6000) return 'normal';       // 60%
    if (roll < 8500) return 'rare';         // 25%
    if (roll < 9500) return 'super_rare';   // 10%
    if (roll < 9900) return 'legendary';    // 4%
    return 'mythic';                        // 1%
  }
}
