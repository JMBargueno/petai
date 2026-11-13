import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { GameDataService } from '../game-data/game-data.service';
import { PetsService } from '../pets/pets.service';

export interface MinigameRewards {
  coins: number;
  xp: number;
  happiness: number;
  energyCost: number;
}

/**
 * Minijuegos con sesiones autoritativas del servidor.
 *
 * El servidor emite la semilla y fija la duración; el cliente solo informa de
 * una puntuación final. Como el resultado no se puede reproducir en el
 * servidor, la validación se basa en: sesión de un solo uso y con caducidad,
 * duración mínima, techo de puntos por segundo, cooldown, coste de energía y
 * límite diario de sesiones recompensadas.
 */
@Injectable()
export class MinigamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
    private readonly petsService: PetsService,
  ) {}

  private get cfg() {
    return this.gameData.getBalance().minigames;
  }

  listGames() {
    return Object.entries(this.cfg.games).map(([id, g]: [string, any]) => ({
      id,
      name: g.name,
      durationSeconds: g.durationSeconds,
      maxScorePerSecond: g.maxScorePerSecond,
      maxCoins: g.maxCoins,
      maxXp: g.maxXp,
    }));
  }

  async start(userId: string, gameId: string, petId: string) {
    const game = this.cfg.games[gameId];
    if (!game) {
      throw new NotFoundException('Minijuego no encontrado');
    }
    if (!petId || typeof petId !== 'string') {
      throw new BadRequestException('petId es obligatorio');
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

    const session = await this.prisma.minigameSession.create({
      data: { userId, petId, gameId, seed: randomInt(1, 2 ** 31 - 1) },
    });

    return {
      sessionId: session.id,
      gameId,
      seed: session.seed,
      durationSeconds: game.durationSeconds,
      maxScorePerSecond: game.maxScorePerSecond,
      expiresAt: new Date(session.startedAt.getTime() + this.cfg.sessionTtlSeconds * 1000),
    };
  }

  async finish(userId: string, sessionId: string, score: number) {
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

    const rewards = this.computeRewards(session.gameId, score);

    await this.prisma.minigameSession.update({
      where: { id: sessionId },
      data: { rewarded: true },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { coins: { increment: rewards.coins }, accountXp: { increment: rewards.xp } },
    });
    const pet = await this.petsService.applyActivityReward(userId, session.petId, rewards);

    return { score, rewards, pet };
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
