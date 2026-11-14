import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PetsService } from '../pets/pets.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

/** Gifts ritual por tipo (feature 030, AC5). */
const GIFT_CONFIG: Record<string, { coins: number; xp: number; item: string }> = {
  feed: { coins: 50, xp: 20, item: 'food_rare' },
  battle: { coins: 100, xp: 50, item: 'skill_boost_1d' },
  minigame: { coins: 30, xp: 15, item: 'minigame_bonus' },
  chat: { coins: 20, xp: 10, item: 'memory_special' },
  clean: { coins: 30, xp: 10, item: 'hygiene_rare' },
};

const TYPES = Object.keys(GIFT_CONFIG);
const MAX_ACTIVE_RITUALS = 5;
const COMPLETION_DAYS = 7;
const MISS_GRACE_DAYS = 3;

export interface CreateRitualInput {
  petId: string;
  type: string;
  hour: number;
  minute?: number;
  cadence?: 'daily' | 'weekly';
  dayOfWeek?: number | null;
}

@Injectable()
export class RitualsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pets: PetsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async list(userId: string) {
    const rituals = await this.prisma.ritual.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(rituals.map((r) => this.withProgress(r)));
  }

  async active(userId: string) {
    const rituals = await this.prisma.ritual.findMany({
      where: { userId, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(rituals.map((r) => this.withProgress(r)));
  }

  async create(userId: string, input: CreateRitualInput) {
    if (!input || !input.petId || !input.type) {
      throw new BadRequestException('petId y type son obligatorios');
    }
    if (!TYPES.includes(input.type)) {
      throw new BadRequestException(`type debe ser uno de: ${TYPES.join(', ')}`);
    }
    const pet = await this.pets.getPetById(userId, input.petId);
    if (pet.userId !== userId) throw new BadRequestException('El pet no pertenece al usuario');

    const cadence = input.cadence === 'weekly' ? 'weekly' : 'daily';
    const dayOfWeek = cadence === 'weekly' ? (input.dayOfWeek ?? null) : null;

    const active = await this.prisma.ritual.findMany({ where: { userId, status: 'active' } });
    if (active.length >= MAX_ACTIVE_RITUALS) {
      const progress = await this.prisma.ritualProgress.findMany({
        where: { userId, ritualId: { in: active.map((r) => r.id) } },
      });
      const map = new Map(progress.map((p) => [p.ritualId, p.totalCompletions]));
      const least = [...active].sort((a, b) => (map.get(a.id) ?? 0) - (map.get(b.id) ?? 0))[0];
      if (least) {
        await this.prisma.ritual.update({ where: { id: least.id }, data: { status: 'paused' } });
      }
    }

    const ritual = await this.prisma.ritual.create({
      data: {
        userId,
        petId: input.petId,
        type: input.type,
        cadence,
        hour: input.hour,
        minute: input.minute ?? 0,
        dayOfWeek,
        status: 'active',
      },
    });
    await this.prisma.ritualProgress.create({
      data: { ritualId: ritual.id, userId, petId: input.petId },
    });

    this.realtime.emitToUser(userId, 'ritual:created', { ritualId: ritual.id, type: ritual.type });
    return this.withProgress(ritual);
  }

  /**
   * Registra una completación de hoy. Aplica progresión: si ya se completó hoy, no
   * duplica; detecta rupturas (reinicia racha / pausa tras >3 días); otorga gift al
   * alcanzar 7 días.
   */
  async check(userId: string, ritualId: string, completionAt?: string) {
    const ritual = await this.prisma.ritual.findFirst({ where: { id: ritualId, userId } });
    if (!ritual) throw new NotFoundException('Ritual no encontrado');
    const progress = await this.prisma.ritualProgress.findUnique({ where: { ritualId } });
    if (!progress) throw new NotFoundException('Progreso de ritual no encontrado');

    const now = completionAt ? new Date(completionAt) : new Date();
    if (this.sameCompletionSlot(ritual, progress.lastCompletedAt, now)) {
      return this.withProgress(ritual, progress);
    }

    const missed = this.detectMiss(ritual, progress.lastCompletedAt, now);
    let streak = progress.streak;
    let missCount = progress.missCount;
    let status = ritual.status;

    if (progress.lastCompletedAt && missed) {
      const gapDays = this.daysBetween(progress.lastCompletedAt, now);
      streak = 0; // reinicio sin castigo (AC6)
      missCount += 1;
      if (gapDays > MISS_GRACE_DAYS) status = 'active'; // volvió tras pausa → reactiva
      this.realtime.emitToUser(userId, 'ritual:missed', { ritualId, day: gapDays });
    } else if (!progress.lastCompletedAt) {
      streak = 1;
    } else {
      streak = progress.streak + 1;
    }

    let gift = null;
    if (streak >= COMPLETION_DAYS) {
      const cfg = GIFT_CONFIG[ritual.type];
      const coinMul = progress.totalCompletions >= 5 ? 0.5 : 1; // anti-inflación
      const coins = Math.floor(cfg.coins * coinMul);
      gift = { coins, xp: cfg.xp, item: cfg.item };
      await this.prisma.user.update({
        where: { id: userId },
        data: { coins: { increment: coins }, accountXp: { increment: cfg.xp } },
      });
      streak = streak % COMPLETION_DAYS;
      this.realtime.emitToUser(userId, 'ritual:completed', {
        ritualId,
        gift,
        totalStreak: progress.totalCompletions + 1,
      });
    }

    const updated = await this.prisma.ritualProgress.update({
      where: { id: progress.id },
      data: {
        streak,
        totalCompletions: { increment: 1 },
        missCount,
        lastCompletedAt: now,
      },
    });
    if (status !== ritual.status) {
      await this.prisma.ritual.update({ where: { id: ritual.id }, data: { status } });
      ritual.status = status;
    }

    this.realtime.emitToUser(userId, 'ritual:progress', {
      ritualId,
      type: ritual.type,
      day: streak,
      streak,
      status: ritual.status,
    });

    return this.withProgress(ritual, updated, gift);
  }

  private async withProgress(ritual: any, progress?: any, gift?: any) {
    const p =
      progress ?? (await this.prisma.ritualProgress.findUnique({ where: { ritualId: ritual.id } }));
    return {
      id: ritual.id,
      type: ritual.type,
      cadence: ritual.cadence,
      hour: ritual.hour,
      minute: ritual.minute,
      dayOfWeek: ritual.dayOfWeek,
      status: ritual.status,
      petId: ritual.petId,
      streak: p?.streak ?? 0,
      goal: COMPLETION_DAYS,
      progress: `${p?.streak ?? 0}/${COMPLETION_DAYS}`,
      totalCompletions: p?.totalCompletions ?? 0,
      lastCompletedAt: p?.lastCompletedAt ?? null,
      gift,
      createdAt: ritual.createdAt,
    };
  }

  private sameCompletionSlot(ritual: any, lastCompletedAt: Date | null, now: Date): boolean {
    if (!lastCompletedAt) return false;
    if (ritual.cadence === 'daily') {
      return this.startOfDay(lastCompletedAt).getTime() === this.startOfDay(now).getTime();
    }
    return this.startOfWeek(lastCompletedAt).getTime() === this.startOfWeek(now).getTime();
  }

  private detectMiss(ritual: any, lastCompletedAt: Date | null, now: Date): boolean {
    if (!lastCompletedAt) return false;
    const expected =
      ritual.cadence === 'daily'
        ? this.startOfDay(new Date(now.getTime() - 24 * 3600 * 1000))
        : this.startOfWeek(new Date(now.getTime() - 7 * 24 * 3600 * 1000));
    return this.startOfDay(lastCompletedAt).getTime() < expected.getTime();
  }

  private daysBetween(a: Date, b: Date): number {
    return Math.round((b.getTime() - a.getTime()) / (24 * 3600 * 1000));
  }

  private startOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  private startOfWeek(d: Date): Date {
    const x = this.startOfDay(d);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // lunes
    return x;
  }
}
