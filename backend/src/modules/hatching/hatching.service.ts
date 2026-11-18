import { MindService } from '../mind/mind.service';
import { Injectable, BadRequestException, ConflictException, NotFoundException, Optional } from '@nestjs/common';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { GameDataService } from '../game-data/game-data.service';
import { normalizePetName, PET_NAME_INVALID_MESSAGE } from '../../common/pet-name';
import { randomPetName } from './pet-names';
import { recordSpend } from '../../stats/spend';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { pickPattern, resolveRarity } from './rarity.engine';

@Injectable()
export class HatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
    @Optional() private readonly realtime?: RealtimeGateway,
    @Optional() private readonly events?: EventEmitter2,
    @Optional() private readonly mind?: MindService,
  ) {}

  /**
   * Huevos sin eclosionar. `remainingMs` es el tiempo de incubación restante según el reloj del
   * servidor: el cliente debe usarlo para la cuenta atrás en vez de comparar `hatchesAt` con su
   * propio reloj (si el del PC va desfasado, el contador mentía y "Eclosionar" fallaba).
   */
  async getEggs(userId: string) {
    const eggs = await this.prisma.egg.findMany({
      where: { userId, hatchedPetId: null },
      orderBy: { startedAt: 'asc' },
    });
    const now = Date.now();
    return eggs.map((egg) => ({ ...egg, remainingMs: Math.max(0, egg.hatchesAt.getTime() - now) }));
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
      // Cobro atómico: la comprobación de saldo y el descuento van en una sola sentencia,
      // así peticiones simultáneas no pueden dejar el saldo en negativo.
      const charged = await tx.user.updateMany({
        where: { id: userId, coins: { gte: costCoins } },
        data: { coins: { decrement: costCoins } },
      });
      if (charged.count === 0) {
        throw new BadRequestException('Monedas insuficientes para comprar un huevo');
      }
      await recordSpend(tx, userId, 'coins', costCoins);

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

  /**
   * Eclosiona un huevo. Concurrencia: el huevo se reclama de forma atómica (solo una petición puede
   * crear la mascota) y el contador de pity se actualiza solo si no cambió desde que se leyó; si otra
   * eclosión simultánea lo modificó, se reintenta con el valor actual.
   *
   * `nickname` es opcional: se normaliza (trim + sin caracteres de control); si está vacío se genera
   * un nombre aleatorio del pool de 300, y si supera los 16 caracteres se rechaza con 400.
   */
  async hatchEgg(userId: string, eggId: string, nickname?: string) {
    if (typeof eggId !== 'string' || eggId.length > 64) throw new NotFoundException('Huevo no encontrado o ya eclosionado');
    const normalized = normalizePetName(nickname);
    if ('invalid' in normalized) throw new BadRequestException(PET_NAME_INVALID_MESSAGE);
    // Se resuelve una única vez (fuera del retry) el nombre definitivo que usará la eclosión.
    const finalNickname = 'name' in normalized ? normalized.name : randomPetName();
    for (let attempt = 0; ; attempt++) {
      try {
        const pet = await this.tryHatch(userId, eggId, finalNickname);
        this.realtime?.emitPetUpdate(userId, pet);
        this.realtime?.emitPetAction(userId, pet.id, 'hatched', { rarity: pet.rarity, shiny: pet.shiny });
        // Estadísticas de colección, misiones y logros (huevos abiertos, rareza, elemento, shiny).
        this.events?.emit('egg:hatched', {
          userId,
          petId: pet.id,
          rarity: pet.rarity,
          element: (pet as any).species?.element,
          shiny: pet.shiny,
        });
        return pet;
      } catch (err) {
        if (err instanceof ConflictException && attempt < 3) continue;
        throw err;
      }
    }
  }

  private async tryHatch(userId: string, eggId: string, nickname: string) {
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

    // La rareza es de la especie. La tirada decide qué especie sale: si no hay especies de la rareza
    // tirada se baja a la más cercana que tenga alguna, y el ejemplar lleva siempre la de su especie.
    const rolledRarity = this.rollRarity(pity.sinceSuperRare, pity.sinceLegendary);
    const allSpecies = this.gameData.getSpecies();
    const speciesRarity = resolveRarity(rolledRarity, allSpecies.map((s: any) => s.rarity));
    const eligibleSpecies = allSpecies.filter((s: any) => s.rarity === speciesRarity);
    const chosenSpecies = eligibleSpecies[crypto.randomInt(0, eligibleSpecies.length)];
    const petRarity: string = chosenSpecies.rarity;

    // Pity: cuenta lo que se ha conseguido de verdad, no lo que se tiró. Si la garantía no puede
    // cumplirse porque aún no hay especies de esa rareza, sigue pendiente.
    let newSinceSuper = pity.sinceSuperRare + 1;
    let newSinceLeg = pity.sinceLegendary + 1;
    if (['super_rare', 'legendary', 'mythic'].includes(petRarity)) newSinceSuper = 0;
    if (['legendary', 'mythic'].includes(petRarity)) newSinceLeg = 0;

    // El patrón tiene su propia rareza y su propia tirada, independiente de la especie.
    const balance = this.gameData.getBalance();
    const chosenPattern = pickPattern<any>(
      this.gameData.getPatterns(),
      balance.rarity,
      crypto.randomInt(0, 1_000_000) / 1_000_000,
      (n) => crypto.randomInt(0, n),
    );

    // Tirada de Shiny (2%)
    const isShiny = crypto.randomInt(0, 100) < 2;

    // Semilla visual determinista
    const visualSeed = crypto.randomInt(1, 2147483647);

    // Multiplicador de combate según la rareza de la especie: todos sus ejemplares nacen iguales
    const rarityMultiplier = balance.rarity[petRarity]?.multiplier || 1.0;

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

    const petId = crypto.randomUUID();
    return this.prisma.$transaction(async (tx) => {
      // 1) Reclamo atómico del huevo: si otra petición lo eclosionó antes, esta se descarta entera
      const claimed = await tx.egg.updateMany({
        where: { id: eggId, userId, hatchedPetId: null },
        data: { hatchedPetId: petId },
      });
      if (claimed.count === 0) throw new NotFoundException('Huevo no encontrado o ya eclosionado');

      // 2) Pity con comparación: solo se escribe si nadie lo cambió desde la lectura
      const pityUpdated = await tx.pityCounter.updateMany({
        where: { userId, sinceSuperRare: pity.sinceSuperRare, sinceLegendary: pity.sinceLegendary },
        data: { sinceSuperRare: newSinceSuper, sinceLegendary: newSinceLeg },
      });
      if (pityUpdated.count === 0) throw new ConflictException('El contador cambió durante la eclosión');

      const pet = await tx.pet.create({
        data: {
          id: petId,
          userId,
          speciesId: chosenSpecies.id,
          rarity: petRarity,
          patternId: chosenPattern.id,
          palette,
          shiny: isShiny,
          visualSeed,
          nickname,
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
          // Spec 36: 5 dimensiones (sesgo de especie ± variación determinista por visualSeed);
          // trait y temperament se derivan de ellas
          personality: (this.mind?.initialPersonality(chosenSpecies.id, visualSeed) ?? { trait: 'curioso', temperament: 'curioso' }) as any,
          lastTickAt: new Date(),
        },
        include: {
          species: true,
          pattern: true,
        },
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
