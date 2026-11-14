import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { GameDataService } from '../modules/game-data/game-data.service';

@Injectable()
export class MissionGenerationService {
  private readonly logger = new Logger(MissionGenerationService.name);
  private readonly HISTORY_DAYS = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly gameData: GameDataService,
  ) {}

  async ensureMissionsExist(userId: string, timezone: string): Promise<void> {
    await Promise.all([
      this.generateDailyMissions(userId, timezone),
      this.generateWeeklyMissions(userId, timezone),
    ]);
  }

  async generateDailyMissions(userId: string, timezone: string): Promise<boolean> {
    const cfg = this.gameData.getMissions()?.daily;
    if (!cfg) {
      this.logger.warn('Config de misiones diarias no encontrada');
      return false;
    }
    const { periodStart, periodEnd } = this.getDailyPeriod(timezone);
    const existing = await this.prisma.mission.count({
      where: { userId, period: 'daily', periodStart, periodEnd },
    });
    if (existing > 0) return false;
    const count = this.randomInt(cfg.minCount, cfg.maxCount);
    const selected = await this.selectMissionTypes(cfg.types, userId, count, 'daily');
    const missions = selected.map((t) => ({
      userId, period: 'daily' as const, type: t.type,
      description: this.formatDescription(t.description, t.target),
      target: t.target, rewardCoins: t.reward.coins ?? 0,
      rewardGems: t.reward.gems ?? 0, rewardXp: t.reward.xp ?? 0,
      periodStart, periodEnd,
    }));
    await this.prisma.mission.createMany({ data: missions });
    await this.saveHistory(userId, 'daily', selected.map((s) => s.type), periodStart);
    this.logger.log(`Generadas ${count} misiones diarias para ${userId}`);
    return true;
  }

  async generateWeeklyMissions(userId: string, timezone: string): Promise<boolean> {
    const cfg = this.gameData.getMissions()?.weekly;
    if (!cfg) {
      this.logger.warn('Config de misiones semanales no encontrada');
      return false;
    }
    const { periodStart, periodEnd } = this.getWeeklyPeriod(timezone);
    const existing = await this.prisma.mission.count({
      where: { userId, period: 'weekly', periodStart, periodEnd },
    });
    if (existing > 0) return false;
    const count = this.randomInt(cfg.minCount, cfg.maxCount);
    const selected = await this.selectMissionTypes(cfg.types, userId, count, 'weekly');
    const missions = selected.map((t) => ({
      userId, period: 'weekly' as const, type: t.type,
      description: this.formatDescription(t.description, t.target),
      target: t.target, rewardCoins: t.reward.coins ?? 0,
      rewardGems: t.reward.gems ?? 0, rewardXp: t.reward.xp ?? 0,
      periodStart, periodEnd,
    }));
    await this.prisma.mission.createMany({ data: missions });
    await this.saveHistory(userId, 'weekly', selected.map((s) => s.type), periodStart);
    this.logger.log(`Generadas ${count} misiones semanales para ${userId}`);
    return true;
  }

  private async selectMissionTypes(
    types: Array<{ type: string; target: number; weight: number; description: string; reward: { coins: number; gems: number; xp: number } }>,
    userId: string,
    count: number,
    period: 'daily' | 'weekly',
  ): Promise<Array<{ type: string; target: number; weight: number; description: string; reward: { coins: number; gems: number; xp: number } }>> {
    const historyTypes = await this.getHistoryTypes(userId, period);
    const repeatedTypes = this.getRepeatedTypes(historyTypes);
    let available = types.filter((t) => !repeatedTypes.has(t.type));
    if (available.length < count) {
      const remaining = types.filter((t) => repeatedTypes.has(t.type));
      available = [...available, ...remaining];
    }
    return this.weightedSelect(available, count);
  }

  private weightedSelect<T extends { weight: number }>(pool: T[], count: number): T[] {
    const available = [...pool];
    const selected: T[] = [];
    while (selected.length < count && available.length > 0) {
      const totalWeight = available.reduce((sum, t) => sum + t.weight, 0);
      let rand = crypto.randomInt(0, totalWeight);
      let idx = 0;
      for (let i = 0; i < available.length; i++) {
        rand -= available[i].weight;
        if (rand < 0) { idx = i; break; }
      }
      selected.push(available[idx]);
      available.splice(idx, 1);
    }
    return selected;
  }

  private getRepeatedTypes(history: Set<string>): Set<string> {
    return history;
  }

  private async getHistoryTypes(userId: string, period: 'daily' | 'weekly'): Promise<Set<string>> {
    const key = this.redis.key(`missions:history:${userId}:${period}`);
    const redisResult = await this.redis.run(async (r) => {
      const raw = await r.get(key);
      if (!raw) return null;
      const history: Array<{ date: string; types: string[] }> = JSON.parse(raw);
      const recent = history.slice(-this.HISTORY_DAYS);
      return new Set(recent.flatMap((h) => h.types));
    });
    if (redisResult !== null) return redisResult;
    const since = new Date(Date.now() - this.HISTORY_DAYS * 24 * 3600 * 1000);
    const history = await this.prisma.mission.findMany({
      where: { userId, period, periodStart: { lte: since } },
      select: { type: true },
      distinct: ['type'],
    });
    return new Set(history.map((m) => m.type));
  }

  private async saveHistory(userId: string, period: 'daily' | 'weekly', types: string[], periodStart: Date): Promise<void> {
    const key = this.redis.key(`missions:history:${userId}:${period}`);
    const dateStr = periodStart.toISOString().slice(0, 10);
    await this.redis.run(async (r) => {
      const raw = await r.get(key);
      const history: Array<{ date: string; types: string[] }> = raw ? JSON.parse(raw) : [];
      history.push({ date: dateStr, types });
      const trimmed = history.slice(-(this.HISTORY_DAYS + 1));
      await r.set(key, JSON.stringify(trimmed));
      await r.expire(key, 30 * 24 * 3600);
    });
  }

  private getDailyPeriod(timezone: string): { periodStart: Date; periodEnd: Date } {
    const now = new Date();
    const periodStart = this.startOfLocalDay(now, timezone);
    const periodEnd = this.endOfLocalDay(now, timezone);
    return { periodStart, periodEnd };
  }

  private getWeeklyPeriod(timezone: string): { periodStart: Date; periodEnd: Date } {
    const now = new Date();
    const periodStart = this.startOfLocalWeek(now, timezone);
    const periodEnd = this.endOfLocalWeek(now, timezone);
    return { periodStart, periodEnd };
  }

  private startOfLocalDay(date: Date, timezone: string): Date {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const parts = dtf.formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
    const utcMidnight = new Date(Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day'))));
    const offsetMs = this.getTimezoneOffset(utcMidnight, timezone);
    return new Date(utcMidnight.getTime() - offsetMs);
  }

  private endOfLocalDay(date: Date, timezone: string): Date {
    const tomorrow = new Date(date.getTime() + 24 * 3600 * 1000);
    return this.startOfLocalDay(tomorrow, timezone);
  }

  private endOfLocalWeek(date: Date, timezone: string): Date {
    const nextWeek = new Date(date.getTime() + 7 * 24 * 3600 * 1000);
    return this.startOfLocalWeek(nextWeek, timezone);
  }

  private startOfLocalWeek(date: Date, timezone: string): Date {
    const dayStart = this.startOfLocalDay(date, timezone);
    const dtf = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' });
    const weekdayStr = dtf.format(date);
    const weekdayMap: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    const daysSinceMonday = weekdayMap[weekdayStr] ?? 0;
    return new Date(dayStart.getTime() - daysSinceMonday * 24 * 3600 * 1000);
  }

  private getTimezoneOffset(date: Date, timezone: string): number {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    const parts = dtf.formatToParts(date);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
    return asUTC - date.getTime();
  }

  private randomInt(min: number, max: number): number {
    return crypto.randomInt(min, max + 1);
  }

  private formatDescription(template: string, target: number): string {
    return template.replace(/{target}/g, String(target));
  }
}