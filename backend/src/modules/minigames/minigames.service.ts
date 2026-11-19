import { Injectable, BadRequestException, NotFoundException, Optional } from '@nestjs/common';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { randomInt } from 'crypto';
import { getGameDefinition, maxLogEntries, replay, unpackLog, TICKS_PER_SECOND } from '@pockai/minigames/logic';
import { PrismaService } from '../../prisma/prisma.service';
import { GameDataService } from '../game-data/game-data.service';
import { PetsService } from '../pets/pets.service';
import { BondingService } from '../bonding/bonding.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ActivityDropsService } from '../inventory/activity-drops.service';

export interface MinigameRewards {
  coins: number;
  xp: number;
  happiness: number;
  energyCost: number;
}

export type MinigameVariant = 'standard' | 'easy';

/** Lo que el cliente envía al terminar, además de la puntuación (spec 39, fase 3). */
export interface MinigameFinishProof {
  /** Ticks de juego jugados (60 por segundo). */
  ticks?: number;
  /** Registro empaquetado de entradas: `[Δtick, kind, ...valores]`. */
  log?: unknown;
}

/**
 * Minijuegos con sesiones autoritativas del servidor.
 *
 * El servidor emite la semilla y fija la duración y la variante. Al terminar, el cliente envía la
 * puntuación y el registro de entradas: el servidor **repite la partida** con la lógica compartida
 * (`@pockai/minigames/logic`) y solo la acepta si da la misma puntuación. Además se mantienen las
 * defensas de siempre: sesión de un solo uso y con caducidad, duración mínima, techo de puntos por
 * segundo, cooldown, coste de energía y límite diario de sesiones recompensadas.
 *
 * Mientras haya clientes antiguos sin registro (Android antes de usar el embed compartido), el
 * registro es opcional salvo que `balance.minigames.requireReplay` sea `true`.
 */
@Injectable()
export class MinigamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
    private readonly petsService: PetsService,
    private readonly bonding: BondingService,
    @Optional() private readonly realtime?: RealtimeGateway,
    @Optional() private readonly events?: EventEmitter2,
    // Drops de actividades (spec 41): opcional para no romper tests que construyen el servicio a mano
    @Optional() private readonly activityDrops?: ActivityDropsService,
  ) {}

  private get cfg() {
    return this.gameData.getBalance().minigames;
  }

  listGames() {
    return Object.entries(this.cfg.games).map(([id, g]: [string, any]) => ({
      id,
      name: g.name,
      element: g.element ?? null,
      durationSeconds: g.durationSeconds,
      maxScorePerSecond: g.maxScorePerSecond,
      maxCoins: g.maxCoins,
      maxXp: g.maxXp,
      energyCost: this.cfg.energyCost,
    }));
  }

  async start(userId: string, gameId: string, petId: string, variant: unknown = 'standard') {
    const game = this.cfg.games[gameId];
    if (!game) {
      throw new NotFoundException('Minijuego no encontrado');
    }
    if (!petId || typeof petId !== 'string') {
      throw new BadRequestException('petId es obligatorio');
    }
    if (variant !== undefined && variant !== null && variant !== 'standard' && variant !== 'easy') {
      throw new BadRequestException('Variante no válida');
    }

    const pet = await this.petsService.getPetById(userId, petId);
    if (pet.sleeping) {
      throw new BadRequestException('La mascota está durmiendo');
    }
    if (pet.energy < this.cfg.minEnergy) {
      throw new BadRequestException('La mascota está demasiado cansada para jugar');
    }

    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000);

    const rewardedToday = await this.prisma.minigameSession.count({
      where: { userId, rewarded: true, finishedAt: { gte: dayAgo } },
    });
    if (rewardedToday >= this.cfg.dailyRewardedSessions) {
      throw new BadRequestException('Has alcanzado el límite diario de partidas con recompensa');
    }

    const last = await this.prisma.minigameSession.findFirst({
      where: { userId },
      orderBy: { startedAt: 'desc' },
    });
    if (last && now.getTime() - last.startedAt.getTime() < this.cfg.cooldownSeconds * 1000) {
      throw new BadRequestException('Espera unos segundos antes de empezar otra partida');
    }

    // Las sesiones abiertas anteriores se cierran sin recompensa (una activa a la vez)
    await this.prisma.minigameSession.updateMany({
      where: { userId, finishedAt: null },
      data: { finishedAt: now },
    });

    const v: MinigameVariant = variant === 'easy' ? 'easy' : 'standard';
    const session = await this.prisma.minigameSession.create({
      data: { userId, petId, gameId, variant: v, seed: randomInt(1, 2 ** 31 - 1) },
    });

    return {
      sessionId: session.id,
      gameId,
      variant: v,
      seed: session.seed,
      durationSeconds: game.durationSeconds,
      maxScorePerSecond: game.maxScorePerSecond,
      expiresAt: new Date(session.startedAt.getTime() + this.cfg.sessionTtlSeconds * 1000),
    };
  }

  async finish(userId: string, sessionId: string, score: number, proof: MinigameFinishProof = {}) {
    if (!Number.isInteger(score) || score < 0) {
      throw new BadRequestException('La puntuación debe ser un entero no negativo');
    }

    const session = await this.prisma.minigameSession.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) {
      throw new NotFoundException('Sesión de minijuego no encontrada');
    }
    if (session.finishedAt) {
      throw new BadRequestException('Esta sesión ya fue finalizada');
    }

    const game = this.cfg.games[session.gameId];
    const now = new Date();

    // Techo absoluto antes de guardar nada: ninguna partida legítima puede superarlo, y así una cifra
    // desorbitada nunca llega a la base de datos (la sesión se cierra sin puntuación ni recompensa).
    const ceiling = Math.ceil(game.maxScorePerSecond * (game.durationSeconds + this.cfg.graceSeconds));
    if (score > ceiling) {
      await this.prisma.minigameSession.updateMany({ where: { id: sessionId, userId, finishedAt: null }, data: { finishedAt: now } });
      throw new BadRequestException('Puntuación imposible: rechazada');
    }

    // Cierre atómico: solo una petición puede finalizar (y recompensar) la sesión
    const claimed = await this.prisma.minigameSession.updateMany({
      where: { id: sessionId, userId, finishedAt: null },
      data: { finishedAt: now, score },
    });
    if (claimed.count === 0) {
      throw new BadRequestException('Esta sesión ya fue finalizada');
    }

    const elapsed = (now.getTime() - session.startedAt.getTime()) / 1000;
    if (elapsed > this.cfg.sessionTtlSeconds) {
      throw new BadRequestException('La sesión ha caducado');
    }
    if (elapsed < game.minDurationSeconds) {
      throw new BadRequestException('Partida demasiado corta: puntuación rechazada');
    }
    const playable = Math.min(elapsed, game.durationSeconds + this.cfg.graceSeconds);
    if (score > Math.ceil(game.maxScorePerSecond * playable)) {
      throw new BadRequestException('Puntuación imposible: rechazada');
    }

    const verified = this.verifyReplay(session, game, score, elapsed, proof);

    const rewards = this.computeRewards(session.gameId, score);
    const affinity = await this.hasAffinity(userId, session.petId, game.element);
    if (affinity) {
      rewards.happiness = Math.round(rewards.happiness * (1 + (this.cfg.elementAffinityBonus ?? 0)));
    }

    await this.prisma.minigameSession.update({
      where: { id: sessionId },
      data: { rewarded: true },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { coins: { increment: rewards.coins }, accountXp: { increment: rewards.xp } },
    });
    const item = await this.maybeDropItem(userId, game, score);
    // Objeto extra de actividades (Enhebrador…): solo en partidas que dieron premio
    const bonusItem = rewards.coins > 0 ? ((await this.activityDrops?.roll(userId, 'minigame')) ?? null) : null;
    const pet = await this.petsService.applyActivityReward(userId, session.petId, rewards);
    // Vínculo (feature 006): minijuego terminado con premio sube el bonding (+2)
    await this.bonding.recordInteraction(session.petId, userId, 'minigame');
    this.realtime?.emitPetAction(userId, session.petId, 'minigame_finished', { gameId: session.gameId, score });
    // Misiones y logros de minijuegos.
    this.events?.emit('minigame:finished', { userId, petId: session.petId, gameId: session.gameId, score });

    return { score, rewards, pet, verified, affinity, item, bonusItem };
  }

  /**
   * Repite la partida con la lógica compartida y comprueba que da la misma puntuación. Devuelve
   * `true` si se pudo verificar, `false` si el cliente no envió registro (y no es obligatorio).
   */
  private verifyReplay(
    session: { gameId: string; seed: number; variant?: string | null },
    game: { durationSeconds: number; element?: string; requireReplay?: boolean },
    score: number,
    elapsed: number,
    proof: MinigameFinishProof,
  ): boolean {
    const def = getGameDefinition(session.gameId);
    // Las Pruebas de los Seis Flujos (con `element`) solo existen en clientes que envían registro:
    // para ellas es obligatorio siempre. Los juegos clásicos dependen de `requireReplay` global
    // mientras queden clientes antiguos.
    const required = game.requireReplay ?? (this.cfg.requireReplay || !!game.element);
    if (proof.log === undefined || proof.log === null || !def) {
      if (required && def) {
        throw new BadRequestException('Falta el registro de la partida');
      }
      return false;
    }
    const durationTicks = Math.round(game.durationSeconds * TICKS_PER_SECOND);
    const ticks = proof.ticks ?? durationTicks;
    if (!Number.isInteger(ticks) || ticks <= 0 || ticks > durationTicks) {
      throw new BadRequestException('Registro de partida no válido');
    }
    // No se puede jugar más rápido que el reloj: los ticks caben en el tiempo real transcurrido.
    if (ticks / TICKS_PER_SECOND > elapsed + this.cfg.graceSeconds) {
      throw new BadRequestException('Registro de partida no válido');
    }
    const log = unpackLog(def, proof.log, maxLogEntries(durationTicks));
    if (!log) {
      throw new BadRequestException('Registro de partida no válido');
    }
    const variant: MinigameVariant = session.variant === 'easy' ? 'easy' : 'standard';
    const result = replay(def, { seed: session.seed, durationSeconds: game.durationSeconds, variant }, log, ticks);
    if (result.score !== score || result.ticks !== ticks) {
      throw new BadRequestException('La puntuación no coincide con la partida jugada');
    }
    return true;
  }

  /** El elemento de la especie coincide con el del juego (Pruebas de los Seis Flujos). */
  private async hasAffinity(userId: string, petId: string, element?: string): Promise<boolean> {
    if (!element) return false;
    const pet = await this.prisma.pet.findFirst({
      where: { id: petId, userId },
      select: { species: { select: { element: true } } },
    });
    return pet?.species?.element === element;
  }

  /** Premio en objeto de algunos juegos (p. ej. la Forja suelta bayas picantes). Lo decide el servidor. */
  private async maybeDropItem(userId: string, game: { itemDrop?: { itemId: string; minScore: number; chance: number } }, score: number) {
    const drop = game.itemDrop;
    if (!drop || score < drop.minScore || randomInt(0, 1_000_000) >= drop.chance * 1_000_000) return null;
    await this.prisma.inventoryItem.upsert({
      where: { userId_itemId: { userId, itemId: drop.itemId } },
      update: { qty: { increment: 1 } },
      create: { userId, itemId: drop.itemId, qty: 1 },
    });
    return { itemId: drop.itemId, qty: 1 };
  }

  computeRewards(gameId: string, score: number): MinigameRewards {
    const game = this.cfg.games[gameId];
    return {
      coins: Math.min(game.maxCoins, Math.floor(score * game.coinsPerPoint)),
      xp: Math.min(game.maxXp, Math.floor(score * game.xpPerPoint)),
      happiness: game.happiness,
      energyCost: this.cfg.energyCost,
    };
  }
}
