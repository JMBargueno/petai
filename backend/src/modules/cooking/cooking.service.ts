import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { RealtimeGateway } from '../realtime/realtime.gateway';
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

/** Ingredientes señuelo que se mezclan con los de la receta, según su dificultad (1–5). */
const DECOYS_BY_DIFFICULTY = [1, 1, 2, 2, 3];
const decoysFor = (difficulty: number) => DECOYS_BY_DIFFICULTY[Math.min(DECOYS_BY_DIFFICULTY.length, Math.max(1, difficulty)) - 1];

@Injectable()
export class CookingService {
  private readonly logger = new Logger(CookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
    private readonly petsService: PetsService,
    @Optional() private readonly realtime?: RealtimeGateway,
  ) {}

  /**
   * Las recetas viven en `shared/game-data/recipes.json`, la única fuente (antes había una copia a
   * mano aquí). Sus ingredientes son objetos de `foods.json`: en el Éter se cocina con éter condensado.
   */
  private recipes(): Recipe[] {
    const raw = this.gameData.readFileFromDisk('recipes');
    if (!Array.isArray(raw) || raw.length === 0) throw new BadRequestException('No hay recetas configuradas');
    return raw as Recipe[];
  }

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
    const available = this.recipes().filter((r) => r.unlockLevel <= pet.level);
    if (available.length === 0) throw new BadRequestException('Nivel insuficiente para cocinar');
    const recipe = available[Math.floor(Math.random() * available.length)];
    // & 0x7FFFFFFF: la columna `cookingSession.seed` es INT4 (signed). `hashSeed` devuelve `>>> 0`
    // (unsigned, hasta 2^32); sin la máscara, ~50% de las semillas no caben → 500 al crear la sesión.
    const seed = hashSeed(`${userId}:${petId}:${Date.now().toString(36)}`) & 0x7fffffff;
    const ingredientOrder = this.buildOrder(this.withDecoys(recipe, seed), seed);
    const hotPotPositions = this.buildHotPots(recipe.ingredients.length, seed);
    const tired = await this.prisma.pet.update({
      where: { id: petId },
      data: { energy: Math.max(0, pet.energy - ENERGY_COST) },
      include: { species: true, pattern: true },
    });
    this.realtime?.emitPetUpdate(userId, tired);
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

  /**
   * Cierra la sesión. Si el cliente manda `picked` (lo que echó a la olla, en orden), el servidor
   * cuenta los aciertos él mismo contra la receta y no se fía de `score` ni de `correctOrder`.
   */
  async submit(userId: string, sessionId: string, score: number, correctOrder: boolean, picked?: string[]) {
    // S-12: `score`/`correctOrder` los afirma el cliente (minijuego de un solo uso). Se validan
    // aquí y `correctCount` se acota abajo para que no se pueda inflar la recompensa.
    if (typeof score !== 'number' || !Number.isFinite(score) || typeof correctOrder !== 'boolean') {
      throw new BadRequestException('score y correctOrder inválidos');
    }
    if (picked !== undefined && (!Array.isArray(picked) || picked.length > 16 || picked.some((p) => typeof p !== 'string'))) {
      throw new BadRequestException('picked inválido');
    }
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
    // La sesión guarda lo que se enseñó al jugador (receta + señuelos, barajado); lo que cuenta para
    // el porcentaje es la receta. Sesiones antiguas de una receta que ya no existe: lo guardado.
    const recipe = this.recipes().find((r) => r.id === session.recipeId);
    const ingredients = recipe?.ingredients ?? (session.ingredients as string[]);
    // S-12: acotar correctCount a [0, ingredientes] → pct <= 1. Sin acotado, un score desorbitado
    // (lo afirma el cliente) daría buff máx. y monedas sin límite.
    const counted = picked ? picked.filter((ing, i) => ingredients[i] === ing).length : Math.floor(correctOrder ? ingredients.length : score / 25);
    const correctCount = Math.min(ingredients.length, Math.max(0, counted));
    const pct = ingredients.length > 0 ? correctCount / ingredients.length : 0;
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
    this.realtime?.emitPetAction(userId, session.petId, 'cooked', { pct: Math.round(pct * 100) });
    return { score: correctCount, buff, coins, correctPct: Math.round(pct * 100) };
  }

  async dailyMenu(userId: string) {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const daySeed = hashSeed(`daily:${dateStr}`);
    const rng = createRng(daySeed);
    const recipes = this.recipes();
    const recipe = recipes[Math.floor(rng() * recipes.length)];
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

  /**
   * Los ingredientes de la receta más unos señuelos (otras comidas), elegidos con la semilla. Sin
   * señuelos el juego era solo ordenar; con ellos también hay que recordar qué entraba.
   */
  private withDecoys(recipe: Recipe, seed: number): string[] {
    const foods = (this.gameData.getFoods() ?? []) as { id: string; kind?: string }[];
    const pool = foods.filter((f) => f.kind === 'food' && !recipe.ingredients.includes(f.id)).map((f) => f.id);
    const rng = createRng(seed + 2);
    const decoys: string[] = [];
    for (let n = decoysFor(recipe.difficulty); n > 0 && pool.length > 0; n--) {
      decoys.push(...pool.splice(Math.floor(rng() * pool.length), 1));
    }
    return [...recipe.ingredients, ...decoys];
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
    const recipe = this.recipes().find((r) => r.id === recipeId);
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