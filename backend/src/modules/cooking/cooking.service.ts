import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GameDataService } from '../game-data/game-data.service';
import { PetsService } from '../pets/pets.service';
import { createRng, hashSeed } from '../battles/combat/rng';

const COOKING_DURATION = 60;
const DAILY_LIMIT = 20;
const ENERGY_COST = 10;
const COOLDOWN_SECONDS = 15;
const BUFF_DURATION_MS = 24 * 3600 * 1000;
const BUFF_CAP_PCT = 0.15;

interface Recipe {
  id: string; name: string; difficulty: number; unlockLevel: number;
  ingredients: string[]; buff: { stat: string; value: number };
}

const RECIPES: Recipe[] = [
  { id: 'starter_soup', name: 'Sopa de Arranque', difficulty: 1, unlockLevel: 1, ingredients: ['carrot', 'onion', 'water'], buff: { stat: 'atk', value: 5 } },
  { id: 'elemental_brew', name: 'Brew Elemental', difficulty: 2, unlockLevel: 5, ingredients: ['herb', 'crystal', 'water', 'salt'], buff: { stat: 'def', value: 5 } },
  { id: 'shadow_paste', name: 'Pasta Sombria', difficulty: 3, unlockLevel: 15, ingredients: ['mushroom', 'ink', 'rice'], buff: { stat: 'esp', value: 5 } },
  { id: 'storm_roast', name: 'Asado Tormenta', difficulty: 3, unlockLevel: 20, ingredients: ['beef', 'lightning', 'pepper', 'salt'], buff: { stat: 'vel', value: 5 } },
  { id: 'solar_bake', name: 'Horno Solar', difficulty: 4, unlockLevel: 30, ingredients: ['flour', 'sun_nectar', 'butter', 'honey'], buff: { stat: 'atk', value: 8 } },
  { id: 'abyssal_caviar', name: 'Caviar Abisal', difficulty: 5, unlockLevel: 40, ingredients: ['roe', 'seaweed', 'pearl'], buff: { stat: 'def', value: 8 } },
  { id: 'mythic_feast', name: 'Banquete Mítico', difficulty: 5, unlockLevel: 50, ingredients: ['phoenix', 'dragon_glass', 'star_dust', 'elixir'], buff: { stat: 'atk', value: 10 } },
];

@Injectable()
export class CookingService {
  private readonly logger = new Logger(CookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
    private readonly petsService: PetsService,
  ) {}

  async start(userId: string, petId: string) {
    if (!petId || typeof petId !== 'string') throw new BadRequestException('petId es obligatorio');
    const pet = await this.petsService.getPetById(userId, petId);
    if (pet.sleeping) throw new BadRequestException('La mascota está durmiendo');
    if (pet.energy < ENERGY_COST) throw new BadRequestException('Energía insuficiente para cocinar');
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
    const sessionsToday = await this.prisma.cookingSession.count({ where: { userId, finishedAt: { gte: dayAgo } } });
    if (sessionsToday >= DAILY_LIMIT) throw new BadRequestException('Límite diario de cocina alcanzado');
    const last = await this.prisma.cookingSession.findFirst({ where: { userId }, orderBy: { startedAt: 'desc' } });
    if (last && Date.now() - last.startedAt.getTime() < COOLDOWN_SECONDS * 1000) {
      throw new BadRequestException('Espera unos segundos antes de cocinar de nuevo');
    }
    const available = RECIPES.filter((r) => r.unlockLevel <= pet.level);
    if (available.length === 0) throw new BadRequestException('Nivel insuficiente para cocinar');
    const recipe = available[Math.floor(Math.random() * available.length)];
    const seed = hashSeed(`${userId}:${petId}:${Date.now().toString(36)}`);
    const ingredientOrder = this.buildOrder(recipe.ingredients, seed);
    const hotPotPositions = this.buildHotPots(recipe.ingredients.length, seed);
    await this.prisma.pet.update({ where: { id: petId }, data: { energy: Math.max(0, pet.energy - ENERGY_COST) } });
    const session = await this.prisma.cookingSession.create({
      data: { userId, petId, recipeId: recipe.id, seed, ingredients: ingredientOrder, hotPotPositions, startedAt: new Date() },
    });
    return {
      sessionId: session.id, recipeId: recipe.id, recipeName: recipe.name, difficulty: recipe.difficulty,
      ingredients: recipe.ingredients, order: ingredientOrder, hotPotPositions,
      durationSeconds: COOKING_DURATION, seed,
      expiresAt: new Date(session.startedAt.getTime() + COOKING_DURATION * 1000),
    };
  }

  async submit(userId: string, sessionId: string, score: number, correctOrder: boolean) {
    const session = await this.prisma.cookingSession.findFirst({ where: { id: sessionId, userId } });
    if (!session) throw new NotFoundException('Sesión no encontrada');
    if (session.finishedAt) throw new BadRequestException('Sesión ya finalizada');
    const claimed = await this.prisma.cookingSession.updateMany({
      where: { id: sessionId, userId, finishedAt: null },
      data: { finishedAt: new Date() },
    });
    if (claimed.count === 0) throw new BadRequestException('Sesión ya finalizada');
    const elapsed = (Date.now() - session.startedAt.getTime()) / 1000;
    if (elapsed > COOKING_DURATION + 5) {
      await this.prisma.cookingSession.update({ where: { id: sessionId }, data: { score: 0 } });
      return { score: 0, buff: null, message: 'Tiempo agotado' };
    }
    const ingredients = session.ingredients as string[];
    const correctCount = correctOrder ? ingredients.length : Math.max(0, Math.floor(score / 25));
    const pct = correctCount / ingredients.length;
    let buff = null;
    if (pct >= 1.0) buff = this.buildBuff(session.recipeId, 1.0);
    else if (pct >= 0.75) buff = this.buildBuff(session.recipeId, 0.5);
    if (buff) {
      await this.createBuff(userId, session.petId, buff);
      await this.prisma.cookingSession.update({ where: { id: sessionId }, data: { buffApplied: true, score: correctCount } });
    } else {
      await this.prisma.cookingSession.update({ where: { id: sessionId }, data: { score: correctCount } });
    }
    const coins = Math.floor(pct * 40);
    if (coins > 0) await this.prisma.user.update({ where: { id: userId }, data: { coins: { increment: coins } } });
    return { score: correctCount, buff, coins, correctPct: Math.round(pct * 100) };
  }

  async dailyMenu(userId: string) {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const daySeed = hashSeed(`daily:${dateStr}`);
    const rng = createRng(daySeed);
    const idx = Math.floor(rng() * RECIPES.length);
    const recipe = RECIPES[idx];
    return {
      date: dateStr, recipeId: recipe.id, recipeName: recipe.name,
      difficulty: recipe.difficulty, ingredients: recipe.ingredients,
      buff: recipe.buff, bonus: 'buff extra ×1.5 hoy',
    };
  }

  private buildOrder(ingredients: string[], seed: number): string[] {
    const rng = createRng(seed);
    const arr = [...ingredients];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  private buildHotPots(ingredientCount: number, seed: number): number[] {
    const rng = createRng(seed + 1);
    const totalSlots = 8;
    const hotCount = Math.min(ingredientCount - 1, 3);
    const positions: number[] = [];
    while (positions.length < hotCount) {
      const pos = Math.floor(rng() * totalSlots);
      if (!positions.includes(pos)) positions.push(pos);
    }
    return positions.sort((a, b) => a - b);
  }

  private buildBuff(recipeId: string, multiplier: number) {
    const recipe = RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return null;
    return { stat: recipe.buff.stat, value: Math.round(recipe.buff.value * multiplier), durationMs: BUFF_DURATION_MS, source: 'cooking', recipeId };
  }

  private async createBuff(userId: string, petId: string, buff: any) {
    const existing = await this.prisma.cookingSession.findMany({
      where: { userId, buffApplied: true, finishedAt: { gte: new Date(Date.now() - BUFF_DURATION_MS) } },
      select: { recipeId: true },
    });
    const totalBuffs = existing.length + 1;
    const effectiveValue = Math.min(buff.value, Math.round(buff.value * BUFF_CAP_PCT));
    this.logger.log(`Buff for ${userId}/${petId}: ${buff.stat}+${effectiveValue} (stacks: ${totalBuffs})`);
  }
}