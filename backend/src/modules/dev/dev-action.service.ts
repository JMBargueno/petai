import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { GameDataService } from '../game-data/game-data.service';
import { simulateBattle } from '../battles/combat/engine';
import { createRng } from '../battles/combat/rng';
import { buildCombatConfig, createSimFighter, SimContext } from '../battles/combat/battle-sim';
import { effectiveStats, equippedSkills, moodMultiplier } from '../battles/combat/stats';
import { Fighter, Strategy } from '../battles/combat/types';

export interface DevActionRequest {
  /** Acción a ejecutar: `feed` | `battle`. */
  action: string;
  /** Pet de la sesión/servidor (validado en el servidor, nunca confía en el cliente). */
  petId: string;
  args?: { foodId?: string; seed?: number; userId?: string };
}

export interface DevActionResult {
  ok: boolean;
  action: string;
  petId: string;
  result: Record<string, unknown>;
}

const clamp = (v: number) => Math.min(100, Math.max(0, v));

@Injectable()
export class DevActionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
  ) {}

  /**
   * Test harness: invoca una acción del juego sin UI. `petId`/`userId` se validan en el servidor
   * (constitución I): el `petId` debe existir y, si se envía `userId`, debe ser su dueño.
   */
  async action(req: DevActionRequest): Promise<DevActionResult> {
    if (!req || typeof req.action !== 'string' || !['feed', 'battle'].includes(req.action)) {
      throw new BadRequestException(`Action no soportada: ${String(req?.action)} (usa 'feed' o 'battle')`);
    }
    if (!req.petId || typeof req.petId !== 'string') {
      throw new BadRequestException('petId es obligatorio');
    }

    const pet = await this.prisma.pet.findFirst({
      where: { id: req.petId },
      include: { species: true },
    });
    if (!pet) throw new NotFoundException(`petId inexistente: ${req.petId}`);
    if (req.args?.userId && pet.userId !== req.args.userId) {
      throw new NotFoundException('El usuario no posee esa mascota');
    }

    const result = req.action === 'feed' ? await this.feedPet(pet, req.args) : this.battlePet(pet, req.args);
    return { ok: true, action: req.action, petId: pet.id, result };
  }

  private async feedPet(pet: any, args?: { foodId?: string }): Promise<Record<string, unknown>> {
    const foods = this.gameData.getFoods();
    const foodId = args?.foodId ?? 'apple';
    const food = foods.find((f) => f.id === foodId);
    if (!food) throw new BadRequestException(`foodId desconocido: ${foodId}`);

    const effects = (food.effects ?? {}) as Record<string, number>;
    const isFavorite = pet.species?.favoriteFood === foodId;
    const multiplier = isFavorite ? 1.5 : 1.0;

    const before = {
      hunger: pet.hunger,
      happiness: pet.happiness,
      energy: pet.energy,
      health: pet.health,
    };
    const after = {
      hunger: clamp(before.hunger + (effects.hunger ?? 0) * multiplier),
      happiness: clamp(before.happiness + (effects.happiness ?? 0) * multiplier),
      energy: clamp(before.energy + (effects.energy ?? 0)),
      health: clamp(before.health + (effects.health ?? 0)),
    };

    await this.prisma.pet.update({
      where: { id: pet.id },
      data: { ...after, sick: effects.curesSick ? false : pet.sick, lastTickAt: new Date() },
    });

    // `vitaleBefore/vitaleAfter` (hambre) por compatibilidad con el contrato de ejemplo.
    return { foodId, isFavorite, vitaleBefore: before.hunger, vitaleAfter: after.hunger, before, after, xpGained: 15 };
  }

  private battlePet(pet: any, args?: { seed?: number }): Record<string, unknown> {
    const species = pet.species;
    const element = species.element;
    const skills = this.gameData.getSkills();
    const balance = this.gameData.getBalance();
    const cfg = buildCombatConfig(balance);

    const strategy: Strategy =
      ['aggressive', 'defensive', 'balanced'].includes(pet.strategy) ? (pet.strategy as Strategy) : 'balanced';
    const me: Fighter = {
      name: pet.nickname,
      speciesId: pet.speciesId,
      element,
      level: pet.level,
      stats: effectiveStats(pet),
      mood: moodMultiplier(pet, cfg),
      skills: equippedSkills(pet, element, skills),
      strategy,
      isBot: false,
      petId: pet.id,
      ownerId: pet.userId,
    };

    const rng = createRng(typeof args?.seed === 'number' ? args.seed : randomInt(2 ** 31));
    const ctx: SimContext = { species: this.gameData.getSpecies(), skills, balance };
    const opponent = createSimFighter(rng, ctx, 999);
    const battleSeed = Math.floor(rng() * 0x100000000);
    const result = simulateBattle(me, opponent, battleSeed, cfg);

    return {
      seed: battleSeed,
      winner: result.winner,
      rounds: result.rounds,
      finalHp: result.finalHp,
      opponent: {
        speciesId: opponent.speciesId,
        element: opponent.element,
        level: opponent.level,
      },
    };
  }
}