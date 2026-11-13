import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MissionGenerationService } from './mission-generation.service';
import { RealtimeGateway } from '../modules/realtime/realtime.gateway';

/**
 * Servicio principal de misiones: expone la lógica de negocio para
 * listar, obtener, y reclamar recompensas de misiones.
 */
@Injectable()
export class MissionsService {
  private readonly logger = new Logger(MissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly generationService: MissionGenerationService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  /**
   * GET /missions — Retorna las misiones activas del usuario (diarias + semanales).
   * Si no hay misiones para el período actual, se generan on-the-fly (lazy init).
   */
  async getMissions(userId: string, timezone: string) {
    // Asegurar que existen misiones para el período actual
    await this.generationService.ensureMissionsExist(userId, timezone);

    const now = new Date();

    const [daily, weekly] = await Promise.all([
      this.prisma.mission.findMany({
        where: {
          userId,
          period: 'daily',
          periodEnd: { gt: now },
        },
        orderBy: { type: 'asc' },
      }),
      this.prisma.mission.findMany({
        where: {
          userId,
          period: 'weekly',
          periodEnd: { gt: now },
        },
        orderBy: { type: 'asc' },
      }),
    ]);

    const dailyCompleted = daily.filter((m) => m.completed).length;
    const dailyChestUnlocked = dailyCompleted === daily.length && daily.length > 0;

    return {
      timestamp: new Date().toISOString(),
      daily: daily.map((m) => this.formatMission(m)),
      weekly: weekly.map((m) => this.formatMission(m)),
      dailyChestUnlocked,
    };
  }

  /**
   * GET /missions/summary — Resumen de progreso y streaks.
   */
  async getSummary(userId: string, timezone: string) {
    await this.generationService.ensureMissionsExist(userId, timezone);

    const now = new Date();

    const [dailyCompleted, dailyTotal, weeklyCompleted, weeklyTotal] = await Promise.all([
      this.prisma.mission.count({
        where: { userId, period: 'daily', completed: true, periodEnd: { gt: now } },
      }),
      this.prisma.mission.count({
        where: { userId, period: 'daily', periodEnd: { gt: now } },
      }),
      this.prisma.mission.count({
        where: { userId, period: 'weekly', completed: true, periodEnd: { gt: now } },
      }),
      this.prisma.mission.count({
        where: { userId, period: 'weekly', periodEnd: { gt: now } },
      }),
    ]);

    // Calcular streak: días consecutivos con todas las diarias completadas
    const streak = await this.calculateStreak(userId, now);
    const bestStreak = await this.calculateBestStreak(userId);

    return {
      dailyCompleted,
      dailyTotal,
      weeklyCompleted,
      weeklyTotal,
      streak,
      bestStreak,
    };
  }

  /**
   * GET /missions/:id — Detalle de una misión específica.
   */
  async getMissionById(userId: string, missionId: string) {
    const mission = await this.prisma.mission.findFirst({
      where: { id: missionId, userId },
    });

    if (!mission) {
      throw new NotFoundException('Misión no encontrada');
    }

    // El detalle incluye metadatos adicionales (period, claimed, periodStart,
    // periodEnd, createdAt) que el formato de lista (formatMission) no expone.
    return this.formatMissionDetail(mission);
  }

  /**
   * POST /missions/:id/claim — Reclamar la recompensa de una misión completada.
   * Solo una vez por misión. Acredita monedas, gemas y XP de forma atómica.
   */
  async claimReward(userId: string, missionId: string) {
    const mission = await this.prisma.mission.findFirst({
      where: { id: missionId, userId },
    });

    if (!mission) {
      throw new NotFoundException('Misión no encontrada');
    }
    if (!mission.completed) {
      throw new BadRequestException('La misión aún no está completada');
    }
    if (mission.claimed) {
      throw new ConflictException('La recompensa ya fue reclamada');
    }

    const now = new Date();

    // Cierre atómico (Constitución I / SC-004): el flip de `claimed`, la acreditación del saldo y
    // el cálculo del estado del cofre ocurren en una ÚNICA transacción Prisma. El `updateMany` con
    // `claimed: false` garantiza que, ante claims concurrentes, solo una petición cumple la condición
    // (count === 1); las demás reciben 409 y la transacción se revierte sin escribir nada.
    const [dailyCompleted, dailyTotal] = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.mission.updateMany({
        where: { id: missionId, userId, claimed: false, completed: true },
        data: { claimed: true },
      });
      if (updated.count === 0) {
        // Otra petición reclamó antes: rollback (no se escribió nada) + 409.
        throw new ConflictException('La recompensa ya fue reclamada');
      }

      // Acreditar la recompensa al usuario en la misma transacción que el flip.
      await tx.user.update({
        where: { id: userId },
        data: {
          coins: { increment: mission.rewardCoins },
          gems: { increment: mission.rewardGems },
          accountXp: { increment: mission.rewardXp },
        },
      });

      // Calcular si se desbloqueó el cofre diario dentro de la transacción (estado coherente).
      return Promise.all([
        tx.mission.count({
          where: { userId, period: 'daily', completed: true, periodEnd: { gt: now } },
        }),
        tx.mission.count({
          where: { userId, period: 'daily', periodEnd: { gt: now } },
        }),
      ]);
    });

    const dailyChestUnlocked = dailyCompleted === dailyTotal && dailyTotal > 0;

    this.logger.log(
      `Misión ${missionId} reclamada por usuario ${userId}: +${mission.rewardCoins} coins, +${mission.rewardGems} gems, +${mission.rewardXp} xp`,
    );

    return {
      mission: {
        id: mission.id,
        type: mission.type,
        completed: mission.completed,
      },
      reward: {
        coins: mission.rewardCoins,
        gems: mission.rewardGems,
        xp: mission.rewardXp,
      },
      dailyChestUnlocked,
    };
  }

  // ─── Métodos privados ───────────────────────────────────────────────────────

  private formatMission(m: {
    id: string; type: string; description: string;
    target: number; current: number; completed: boolean;
    rewardCoins: number; rewardGems: number; rewardXp: number;
    periodEnd: Date; period: string;
  }) {
    return {
      id: m.id,
      type: m.type,
      description: m.description,
      target: m.target,
      current: m.current,
      completed: m.completed,
      reward: { coins: m.rewardCoins, gems: m.rewardGems, xp: m.rewardXp },
      resetsAt: m.periodEnd.toISOString(),
    };
  }

  /**
   * Formatea una misión en el formato de **detalle** (`GET /missions/:id`), el cual expone los
   * metadatos completos: `period`, `claimed`, `periodStart`, `periodEnd` y `createdAt`, además del
   * `reward`. Es distinto al formato de lista (`formatMission`), que solo expone `resetsAt`.
   */
  private formatMissionDetail(m: {
    id: string;
    period: string;
    type: string;
    description: string;
    target: number;
    current: number;
    completed: boolean;
    claimed: boolean;
    rewardCoins: number;
    rewardGems: number;
    rewardXp: number;
    periodStart: Date;
    periodEnd: Date;
    createdAt: Date;
  }) {
    return {
      id: m.id,
      period: m.period,
      type: m.type,
      description: m.description,
      target: m.target,
      current: m.current,
      completed: m.completed,
      claimed: m.claimed,
      reward: { coins: m.rewardCoins, gems: m.rewardGems, xp: m.rewardXp },
      periodStart: m.periodStart.toISOString(),
      periodEnd: m.periodEnd.toISOString(),
      createdAt: m.createdAt.toISOString(),
    };
  }

  private async calculateStreak(userId: string, now: Date): Promise<number> {
    const allMissions = await this.prisma.mission.findMany({
      where: { userId, period: 'daily', periodEnd: { lte: now } },
      select: { periodStart: true, completed: true },
    });

    const periodMap = new Map<string, { total: number; completed: number }>();
    for (const m of allMissions) {
      const key = m.periodStart.toISOString().slice(0, 10);
      const entry = periodMap.get(key) ?? { total: 0, completed: 0 };
      entry.total++;
      if (m.completed) entry.completed++;
      periodMap.set(key, entry);
    }

    const completedDates = new Set(
      [...periodMap.entries()].filter(([, v]) => v.completed === v.total).map(([k]) => k),
    );

    let streak = 0;
    let checkDate = new Date(now);
    const todayStr = checkDate.toISOString().slice(0, 10);
    if (!completedDates.has(todayStr)) {
      checkDate = new Date(checkDate.getTime() - 24 * 3600 * 1000);
    }

    while (completedDates.has(checkDate.toISOString().slice(0, 10))) {
      streak++;
      checkDate = new Date(checkDate.getTime() - 24 * 3600 * 1000);
    }
    return streak;
  }

  private async calculateBestStreak(userId: string): Promise<number> {
    const allDailyMissions = await this.prisma.mission.findMany({
      where: { userId, period: 'daily' },
      select: { periodStart: true, completed: true },
    });
    if (allDailyMissions.length === 0) return 0;

    const periodMap = new Map<string, { total: number; completed: number }>();
    for (const m of allDailyMissions) {
      const key = m.periodStart.toISOString().slice(0, 10);
      const entry = periodMap.get(key) ?? { total: 0, completed: 0 };
      entry.total++;
      if (m.completed) entry.completed++;
      periodMap.set(key, entry);
    }

    const completedDates = [...periodMap.entries()]
      .filter(([, v]) => v.completed === v.total)
      .map(([k]) => k).sort();

    let best = 0, current = 0;
    let prevDate: Date | null = null;
    for (const dateStr of completedDates) {
      const date = new Date(dateStr + 'T00:00:00Z');
      if (prevDate) {
        const diff = Math.round((date.getTime() - prevDate.getTime()) / (24 * 3600 * 1000));
        current = diff === 1 ? current + 1 : 1;
      } else {
        current = 1;
      }
      best = Math.max(best, current);
      prevDate = date;
    }
    return best;
  }
}