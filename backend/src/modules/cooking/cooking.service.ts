import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PrismaService } from '../../prisma/prisma.service';
import { GameDataService } from '../game-data/game-data.service';
import { PetsService } from '../pets/pets.service';
import { createRng, hashSeed } from '../battles/combat/rng';

export type BuffStat = 'atk' | 'def' | 'esp' | 'vel';
const BUFF_STATS: BuffStat[] = ['atk', 'def', 'esp', 'vel'];

export interface Recipe {
  id: string; name: string; description?: string; difficulty: number; unlockLevel: number;
  ingredients: string[]; buff: { stat: BuffStat | 'all'; value: number };
  /** Menú del día: solo se cocina el día de la semana `weekday` (UTC, 0 = domingo). */
  dailyMenu?: boolean; weekday?: number;
}

/** `balance.json` → `cooking`. Tablas por dificultad: índice 0 = dificultad 1. */
export interface CookingConfig {
  dailyLimit: number; energyCost: number; cooldownSeconds: number; buffDurationHours: number; buffCapPct: number;
  gracePeriodSeconds: number; minSecondsPerIngredient: number;
  thresholds: { perfect: number; good: number };
  goodBuffFactor: number; dailyMenuBuffFactor: number;
  coins: { max: number; speedBonusMax: number };
  decoysByDifficulty: number[]; revealMsByDifficulty: number[]; durationSecondsByDifficulty: number[];
  hotPot: { maxPerRecipe: number; windowMsByDifficulty: number[] };
}

/** Lo que tarda el cliente en dictar la receta y dejarla a la vista (CookingTab: REVEAL + HOLD). */
const HOLD_MS = 2500;
/** Margen para la latencia al medir la olla caliente. */
const HOT_POT_SLACK_MS = 400;

export type SlotResult = 'ok' | 'miss' | 'burned';
export type Grade = 'perfect' | 'good' | 'bad';

const byDifficulty = (table: number[], difficulty: number) =>
  table[Math.min(table.length, Math.max(1, Math.round(difficulty))) - 1];

/**
 * Empareja lo que se echó a la olla con la receta por la subsecuencia común más larga: un
 * ingrediente olvidado o un señuelo en medio ya no desplaza (y anula) todo lo que va detrás.
 * Devuelve, por cada ingrediente de la receta, la posición de `picked` con la que casó (o -1).
 */
export function alignPicked(recipe: string[], picked: string[]): number[] {
  const n = recipe.length, m = picked.length;
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = recipe[i] === picked[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const match = new Array<number>(n).fill(-1);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (recipe[i] === picked[j]) { match[i] = j; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return match;
}

@Injectable()
export class CookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
    private readonly petsService: PetsService,
    @Optional() private readonly realtime?: RealtimeGateway,
  ) {}

  private get cfg(): CookingConfig {
    const c = this.gameData.getBalance()?.cooking;
    if (!c) throw new BadRequestException('Falta la configuración de cocina');
    return c as CookingConfig;
  }

  /**
   * Las recetas viven en `shared/game-data/recipes.json`, la única fuente. Sus ingredientes son
   * objetos de `foods.json`: en el Éter se cocina con éter condensado.
   */
  private recipes(): Recipe[] {
    const raw = this.gameData.readFileFromDisk('recipes');
    if (!Array.isArray(raw) || raw.length === 0) throw new BadRequestException('No hay recetas configuradas');
    return raw as Recipe[];
  }

  /** El menú de hoy (UTC). Hay exactamente uno por día de la semana (lo comprueba el validador). */
  private todaysMenu(now = new Date()): Recipe {
    const menu = this.recipes().find((r) => r.dailyMenu && r.weekday === now.getUTCDay());
    if (!menu) throw new BadRequestException('Hoy no hay menú del día');
    return menu;
  }

  /** Parámetros de juego de una receta: ritmo del dictado, tiempo y ventana de la olla caliente. */
  private rules(recipe: Recipe) {
    const c = this.cfg;
    return {
      revealMs: byDifficulty(c.revealMsByDifficulty, recipe.difficulty),
      durationSeconds: byDifficulty(c.durationSecondsByDifficulty, recipe.difficulty),
      hotPotWindowMs: byDifficulty(c.hotPot.windowMsByDifficulty, recipe.difficulty),
    };
  }

  async start(userId: string, petId: string, recipeId?: string) {
    if (!petId || typeof petId !== 'string') throw new BadRequestException('petId es obligatorio');
    if (recipeId !== undefined && typeof recipeId !== 'string') throw new BadRequestException('recipeId inválido');
    const c = this.cfg;
    const pet = await this.petsService.getPetById(userId, petId);
    if (pet.sleeping) throw new BadRequestException('La mascota está durmiendo');
    if (pet.energy < c.energyCost) throw new BadRequestException('Energía insuficiente para cocinar');

    // Sin receta pedida se cocina el menú del día.
    const recipe = recipeId ? this.recipes().find((r) => r.id === recipeId) : this.todaysMenu();
    if (!recipe) throw new NotFoundException('Esa receta no existe');
    if (recipe.dailyMenu && recipe.weekday !== new Date().getUTCDay()) throw new BadRequestException('Ese menú no es el de hoy');
    if (!recipe.dailyMenu && recipe.unlockLevel > pet.level) throw new BadRequestException(`Esta receta se aprende a nivel ${recipe.unlockLevel}`);

    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
    const sessionsToday = await this.prisma.cookingSession.count({ where: { userId, finishedAt: { gte: dayAgo } } });
    if (sessionsToday >= c.dailyLimit) throw new BadRequestException('Límite diario de cocina alcanzado');
    const last = await this.prisma.cookingSession.findFirst({ where: { userId }, orderBy: { startedAt: 'desc' } });
    if (last && Date.now() - last.startedAt.getTime() < c.cooldownSeconds * 1000) {
      throw new BadRequestException('Espera unos segundos antes de cocinar de nuevo');
    }

    // & 0x7FFFFFFF: la columna `cookingSession.seed` es INT4 (signed). `hashSeed` devuelve `>>> 0`
    // (unsigned, hasta 2^32); sin la máscara, ~50% de las semillas no caben → 500 al crear la sesión.
    const seed = hashSeed(`${userId}:${petId}:${Date.now().toString(36)}`) & 0x7fffffff;
    const ingredientOrder = this.buildOrder(this.withDecoys(recipe, seed), seed);
    const hotPotPositions = this.buildHotPots(recipe, seed);
    // Descuento atómico: si otra petición gastó la energía entre medias, no se cocina.
    const spent = await this.prisma.pet.updateMany({
      where: { id: petId, energy: { gte: c.energyCost } },
      data: { energy: { decrement: c.energyCost } },
    });
    if (spent.count === 0) throw new BadRequestException('Energía insuficiente para cocinar');
    const tired = await this.prisma.pet.findUnique({ where: { id: petId }, include: { species: true, pattern: true } });
    if (tired) this.realtime?.emitPetUpdate(userId, tired);
    const session = await this.prisma.cookingSession.create({
      data: { userId, petId, recipeId: recipe.id, seed, ingredients: ingredientOrder, hotPotPositions, startedAt: new Date() },
    });
    const rules = this.rules(recipe);
    return {
      sessionId: session.id, recipeId: recipe.id, recipeName: recipe.name, recipeDescription: recipe.description ?? null,
      difficulty: recipe.difficulty, isDailyMenu: !!recipe.dailyMenu,
      ingredients: recipe.ingredients, order: ingredientOrder, hotPotPositions,
      ...rules, seed,
      expiresAt: new Date(session.startedAt.getTime() + rules.durationSeconds * 1000),
    };
  }

  /**
   * Cierra la sesión. Si el cliente manda `picked` (lo que echó a la olla, en orden), el servidor
   * cuenta los aciertos él mismo contra la receta y no se fía de `score` ni de `correctOrder`.
   * `pickedAt` (ms desde que empezó a cocinar, uno por ingrediente echado) sirve para la olla
   * caliente: en esas posiciones el ingrediente tiene que llegar a tiempo o se quema.
   */
  async submit(userId: string, sessionId: string, score: number, correctOrder: boolean, picked?: string[], pickedAt?: number[]) {
    // S-12: `score`/`correctOrder` los afirma el cliente (minijuego de un solo uso). Se validan
    // aquí y `correctCount` se acota abajo para que no se pueda inflar la recompensa.
    if (typeof score !== 'number' || !Number.isFinite(score) || typeof correctOrder !== 'boolean') {
      throw new BadRequestException('score y correctOrder inválidos');
    }
    if (picked !== undefined && (!Array.isArray(picked) || picked.length > 16 || picked.some((p) => typeof p !== 'string'))) {
      throw new BadRequestException('picked inválido');
    }
    if (pickedAt !== undefined && (!Array.isArray(pickedAt) || !picked || pickedAt.length !== picked.length
      || pickedAt.some((t, i) => typeof t !== 'number' || !Number.isFinite(t) || t < 0 || (i > 0 && t < pickedAt[i - 1])))) {
      throw new BadRequestException('pickedAt inválido');
    }
    const c = this.cfg;
    const session = await this.prisma.cookingSession.findFirst({ where: { id: sessionId, userId } });
    if (!session) throw new NotFoundException('Sesión no encontrada');
    if (session.finishedAt) throw new BadRequestException('Sesión ya finalizada');
    const claimed = await this.prisma.cookingSession.updateMany({
      where: { id: sessionId, userId, finishedAt: null },
      data: { finishedAt: new Date() },
    });
    if (claimed.count === 0) throw new BadRequestException('Sesión ya finalizada');

    // La sesión guarda lo que se enseñó al jugador (receta + señuelos, barajado); lo que cuenta para
    // el porcentaje es la receta. Sesiones antiguas de una receta que ya no existe: lo guardado.
    const recipe = this.recipes().find((r) => r.id === session.recipeId);
    const ingredients = recipe?.ingredients ?? (session.ingredients as string[]);
    const rules = recipe ? this.rules(recipe) : { revealMs: 0, durationSeconds: 60, hotPotWindowMs: Infinity };
    const memorizeMs = ingredients.length * rules.revealMs + HOLD_MS;
    const elapsedMs = Date.now() - session.startedAt.getTime();
    const cookMs = Math.max(0, elapsedMs - memorizeMs);
    const fail = async (message: string) => {
      await this.prisma.cookingSession.update({ where: { id: sessionId }, data: { score: 0 } });
      return { score: 0, buff: null, coins: 0, speedBonus: 0, correctPct: 0, grade: 'bad' as Grade, slots: ingredients.map(() => 'miss' as SlotResult), message: message as string | null };
    };
    if (cookMs > (rules.durationSeconds + c.gracePeriodSeconds) * 1000) return fail('Tiempo agotado');
    // Nadie memoriza y sirve un plato entero en menos de lo que dura el dictado.
    if (picked && picked.length > 0 && elapsedMs < ingredients.length * (rules.revealMs + c.minSecondsPerIngredient * 1000)) {
      return fail('Demasiado rápido');
    }

    let slots: SlotResult[];
    if (picked) {
      const match = alignPicked(ingredients, picked);
      const hot = new Set((session.hotPotPositions as number[] | null) ?? []);
      slots = match.map((j, i) => {
        if (j < 0) return 'miss';
        if (hot.has(i) && pickedAt && j > 0 && pickedAt[j] - pickedAt[j - 1] > rules.hotPotWindowMs + HOT_POT_SLACK_MS) return 'burned';
        return 'ok';
      });
    } else {
      // Clientes viejos sin `picked`: lo que afirman, acotado a la receta (S-12).
      const claimedHits = Math.min(ingredients.length, Math.max(0, Math.floor(correctOrder ? ingredients.length : score / 25)));
      slots = ingredients.map((_, i) => (i < claimedHits ? 'ok' : 'miss'));
    }
    const correctCount = slots.filter((s) => s === 'ok').length;
    const pct = ingredients.length > 0 ? correctCount / ingredients.length : 0;
    const grade: Grade = pct >= c.thresholds.perfect ? 'perfect' : pct >= c.thresholds.good ? 'good' : 'bad';

    let buff = null;
    if (recipe && grade !== 'bad') {
      buff = this.buildBuff(recipe, grade === 'perfect' ? 1 : c.goodBuffFactor);
      await this.grantBuff(session.petId, buff);
    }
    await this.prisma.cookingSession.update({ where: { id: sessionId }, data: { buffApplied: !!buff, score: correctCount } });

    // Rapidez: solo un plato perfecto, en proporción al tiempo que sobró.
    const speedBonus = grade === 'perfect'
      ? Math.floor(c.coins.speedBonusMax * Math.max(0, 1 - cookMs / (rules.durationSeconds * 1000)))
      : 0;
    const coins = Math.floor(pct * c.coins.max) + speedBonus;
    if (coins > 0) await this.prisma.user.update({ where: { id: userId }, data: { coins: { increment: coins } } });
    this.realtime?.emitPetAction(userId, session.petId, 'cooked', { pct: Math.round(pct * 100) });
    return { score: correctCount, buff, coins, speedBonus, correctPct: Math.round(pct * 100), grade, slots, message: null as string | null };
  }

  /** El menú de hoy, con el buff ya multiplicado. Cambia a medianoche UTC. */
  async dailyMenu(_userId: string) {
    const now = new Date();
    const recipe = this.todaysMenu(now);
    const factor = this.cfg.dailyMenuBuffFactor;
    const nextReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    return {
      date: now.toISOString().split('T')[0], recipeId: recipe.id, recipeName: recipe.name,
      description: recipe.description ?? null, weekday: recipe.weekday,
      difficulty: recipe.difficulty, ingredients: recipe.ingredients,
      buff: { stat: recipe.buff.stat, value: Math.round(recipe.buff.value * factor) },
      bonus: `buff ×${factor} hoy`, nextReset,
    };
  }

  /**
   * El recetario: todas las recetas, si se pueden cocinar ya con esta mascota y la mejor nota del
   * usuario en cada una. De las que aún no se pueden cocinar no se enseñan los ingredientes.
   */
  async recipeBook(userId: string, petId: string) {
    if (!petId || typeof petId !== 'string') throw new BadRequestException('petId es obligatorio');
    const pet = await this.petsService.getPetById(userId, petId);
    const today = new Date().getUTCDay();
    const best = await this.prisma.cookingSession.groupBy({
      by: ['recipeId'], where: { userId, finishedAt: { not: null } }, _max: { score: true },
    });
    const bestBy = new Map(best.map((b: { recipeId: string; _max: { score: number | null } }) => [b.recipeId, b._max.score ?? 0]));
    const factor = this.cfg.dailyMenuBuffFactor;
    return this.recipes().map((r) => {
      const today_ = !!r.dailyMenu && r.weekday === today;
      const available = r.dailyMenu ? today_ : r.unlockLevel <= pet.level;
      const bestScore = bestBy.get(r.id) ?? null;
      return {
        id: r.id, name: r.name, description: r.description ?? null, difficulty: r.difficulty,
        unlockLevel: r.unlockLevel, dailyMenu: !!r.dailyMenu, weekday: r.weekday ?? null, today: today_, available,
        ingredients: available ? r.ingredients : null,
        buff: today_ ? { stat: r.buff.stat, value: Math.round(r.buff.value * factor) } : r.buff,
        best: bestScore, perfect: bestScore !== null && bestScore >= r.ingredients.length,
      };
    });
  }

  /** Buffs de comida activos de una mascota (para el panel). */
  async activeBuffs(userId: string, petId: string) {
    if (!petId || typeof petId !== 'string') throw new BadRequestException('petId es obligatorio');
    await this.petsService.getPetById(userId, petId);
    const rows = await this.prisma.combatBuff.findMany({
      where: { petId, expiresAt: { gt: new Date() } }, orderBy: { stat: 'asc' },
    });
    return rows.map((b: any) => ({ stat: b.stat, value: b.value, source: b.source, sourceId: b.sourceId, expiresAt: b.expiresAt }));
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
    for (let n = byDifficulty(this.cfg.decoysByDifficulty, recipe.difficulty); n > 0 && pool.length > 0; n--) {
      decoys.push(...pool.splice(Math.floor(rng() * pool.length), 1));
    }
    return [...recipe.ingredients, ...decoys];
  }

  /**
   * Olla caliente: posiciones de la receta (nunca la primera) en las que el ingrediente tiene que
   * llegar antes de `hotPotWindowMs` desde el anterior o se quema. Dificultad 1: ninguna.
   */
  private buildHotPots(recipe: Recipe, seed: number): number[] {
    const n = recipe.ingredients.length;
    const count = Math.min(this.cfg.hotPot.maxPerRecipe, Math.max(0, recipe.difficulty - 1), n - 1);
    const rng = createRng(seed + 1);
    const positions: number[] = [];
    while (positions.length < count) {
      const pos = 1 + Math.floor(rng() * (n - 1));
      if (!positions.includes(pos)) positions.push(pos);
    }
    return positions.sort((a, b) => a - b);
  }

  private buildBuff(recipe: Recipe, multiplier: number) {
    const factor = recipe.dailyMenu ? this.cfg.dailyMenuBuffFactor : 1;
    return {
      stat: recipe.buff.stat, value: Math.max(1, Math.round(recipe.buff.value * multiplier * factor)),
      durationMs: this.cfg.buffDurationHours * 3600 * 1000, source: 'cooking', recipeId: recipe.id,
    };
  }

  /**
   * Guarda el buff en `CombatBuff` (uno por mascota, stat y fuente): si ya había uno activo se queda
   * el mayor valor y se renueva la duración. `all` reparte el mismo valor a las cuatro stats.
   * El combate lo suma a la stat con tope `buffCapPct` (ver `applyStatBuffs`).
   */
  private async grantBuff(petId: string, buff: { stat: BuffStat | 'all'; value: number; durationMs: number; source: string; recipeId: string }) {
    const expiresAt = new Date(Date.now() + buff.durationMs);
    const stats = buff.stat === 'all' ? BUFF_STATS : [buff.stat];
    const now = new Date();
    for (const stat of stats) {
      const prev = await this.prisma.combatBuff.findUnique({ where: { petId_stat_source: { petId, stat, source: buff.source } } });
      const value = prev && prev.expiresAt > now ? Math.max(prev.value, buff.value) : buff.value;
      await this.prisma.combatBuff.upsert({
        where: { petId_stat_source: { petId, stat, source: buff.source } },
        create: { petId, stat, value, source: buff.source, sourceId: buff.recipeId, expiresAt },
        update: { value, sourceId: buff.recipeId, expiresAt },
      });
    }
  }
}
