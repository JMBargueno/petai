import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GameDataService } from '../game-data/game-data.service';
import { RedisService } from './redis.service';
import { isoWeekKey } from './combat/ranking';

export type BoardScope = 'global' | 'weekly';

export interface BoardRow {
  petId: string;
  score: number;
  rank: number;
}

const WEEK_TTL_SECONDS = 21 * 24 * 3600;
const MAX_LIMIT = 100;

/**
 * Clasificaciones en Redis (ZSET):
 *  - global: ELO actual de cada mascota que ha peleado.
 *  - weekly: puntos de liga de la semana ISO (victoria 3, empate 1, derrota 0) para el atacante.
 * Si Redis no responde, se calculan desde PostgreSQL (más lento, pero sin perder el servicio).
 */
@Injectable()
export class LeaderboardService {
  private readonly logger = new Logger(LeaderboardService.name);
  private readonly rebuilt = new Set<string>();

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
  ) {}

  private boardKey(scope: BoardScope, date = new Date()): string {
    return this.redis.key(scope === 'global' ? 'lb:global' : `lb:week:${isoWeekKey(date)}`);
  }

  private get weeklyPoints() {
    return this.gameData.getBalance().combats.weeklyPoints as { win: number; draw: number; loss: number };
  }

  weeklyPointsFor(outcome: 'win' | 'draw' | 'loss'): number {
    return this.weeklyPoints[outcome] ?? 0;
  }

  /** Registra el resultado de un combate en las clasificaciones (no lanza si Redis falla). */
  async record(entries: { petId: string; elo: number; weeklyPoints?: number }[]) {
    await this.redis.run(async (r) => {
      const pipe = r.multi();
      const weekly = this.boardKey('weekly');
      for (const e of entries) {
        pipe.zadd(this.boardKey('global'), e.elo, e.petId);
        if (e.weeklyPoints !== undefined) pipe.zincrby(weekly, e.weeklyPoints, e.petId);
      }
      pipe.expire(weekly, WEEK_TTL_SECONDS);
      await pipe.exec();
    });
  }

  async top(scope: BoardScope, limit = 20): Promise<BoardRow[]> {
    const n = Math.min(Math.max(1, Math.floor(limit) || 20), MAX_LIMIT);
    const fromRedis = await this.redis.run(async (r) => {
      const key = this.boardKey(scope);
      let count = await r.zcard(key);
      if (count === 0 && !this.rebuilt.has(key)) {
        // Redis vacío (primer arranque o reinicio): se reconstruye una vez desde la base de datos
        this.rebuilt.add(key);
        await this.rebuild(scope);
        count = await r.zcard(key);
      }
      if (count === 0) return [] as BoardRow[];
      const raw = await r.zrevrange(key, 0, n - 1, 'WITHSCORES');
      const rows: BoardRow[] = [];
      for (let i = 0; i < raw.length; i += 2) rows.push({ petId: raw[i], score: Number(raw[i + 1]), rank: i / 2 + 1 });
      return rows;
    });
    if (fromRedis) return fromRedis;
    return this.topFromDb(scope, n);
  }

  /** Posición (1 = primero) y puntuación de una mascota, o null si aún no figura. */
  async rankOf(scope: BoardScope, petId: string): Promise<{ rank: number; score: number } | null> {
    const fromRedis = await this.redis.run(async (r) => {
      const key = this.boardKey(scope);
      const [rank, score] = await Promise.all([r.zrevrank(key, petId), r.zscore(key, petId)]);
      return rank === null || score === null ? undefined : { rank: rank + 1, score: Number(score) };
    });
    if (fromRedis === undefined) return null; // Redis responde: no figura
    if (fromRedis) return fromRedis;
    const rows = await this.topFromDb(scope, MAX_LIMIT * 10);
    const row = rows.find((x) => x.petId === petId);
    return row ? { rank: row.rank, score: row.score } : null;
  }

  // ---------- Respaldo y reconstrucción desde PostgreSQL ----------

  private async computeFromDb(scope: BoardScope): Promise<{ petId: string; score: number }[]> {
    if (scope === 'global') {
      const pets = await this.prisma.pet.findMany({
        where: { OR: [{ battlesAsAttacker: { some: {} } }, { battlesAsDefender: { some: {} } }] },
        select: { id: true, elo: true },
        orderBy: [{ elo: 'desc' }, { id: 'asc' }],
        take: 1000,
      });
      return pets.map((p) => ({ petId: p.id, score: p.elo }));
    }

    // Semanal: puntos de los combates de la semana en curso (UTC, lunes 00:00)
    const now = new Date();
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const battles = await this.prisma.battle.findMany({
      where: { createdAt: { gte: monday } },
      select: { attackerPetId: true, winnerPetId: true, log: true },
      take: 20000,
    });
    const points = new Map<string, number>();
    for (const b of battles) {
      const winner = (b.log as any)?.events?.at?.(-1)?.winner;
      const outcome = winner === 0 ? 'win' : winner === null || winner === undefined ? 'draw' : 'loss';
      points.set(b.attackerPetId, (points.get(b.attackerPetId) ?? 0) + this.weeklyPointsFor(outcome));
    }
    return [...points.entries()].map(([petId, score]) => ({ petId, score })).sort((a, b) => b.score - a.score || a.petId.localeCompare(b.petId));
  }

  private async topFromDb(scope: BoardScope, n: number): Promise<BoardRow[]> {
    const rows = await this.computeFromDb(scope);
    return rows.slice(0, n).map((r, i) => ({ ...r, rank: i + 1 }));
  }

  private async rebuild(scope: BoardScope) {
    const rows = await this.computeFromDb(scope);
    if (rows.length === 0) return;
    await this.redis.run(async (r) => {
      const key = this.boardKey(scope);
      const pipe = r.multi();
      for (const row of rows) pipe.zadd(key, row.score, row.petId);
      if (scope === 'weekly') pipe.expire(key, WEEK_TTL_SECONDS);
      await pipe.exec();
    });
    this.logger.log(`Clasificación ${scope} reconstruida desde la base de datos (${rows.length} entradas)`);
  }
}
