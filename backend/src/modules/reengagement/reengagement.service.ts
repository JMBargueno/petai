import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DiaryService, DiaryEntry } from './diary.service';

export type WelcomeBackTier = 'happy' | 'offended' | 'sad' | 'emotional';

/** Umbrales (ms) — límites inferiores de cada tramo. */
const MIN_ACTIVE_MS = 24 * 3_600_000; // 24h
const OFFENDED_MS = 48 * 3_600_000; // 48h
const SAD_MS = 7 * 24 * 3_600_000; // 7 días
const EMOTIONAL_MS = 30 * 24 * 3_600_000; // 30 días
const RECOVERY_BUFF_MS = 24 * 3_600_000; // 24h
const ANTI_SPAM_MS = 30 * 60 * 1000; // 30min
const OFFENDED_CLICKS = 5;
const EMOTIONAL_COINS = 200;

export interface ForgiveAction {
  clicks?: number;
  chat?: string;
  actions?: string[];
}

/**
 * ReengagementService — Feature 028. Detección de ausencia, tramo emocional,
 * ritual de perdón y recovery buff (24h anti-decaimiento). Tono nunca punitivo.
 */
@Injectable()
export class ReengagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly diaryService: DiaryService,
  ) {}

  /** Computa la ausencia (ms) y el tramo emocional. */
  computeAbsence(lastLoginAt: Date, now: Date = new Date()): { absenceMs: number; tier: WelcomeBackTier } {
    const absenceMs = Math.max(0, now.getTime() - lastLoginAt.getTime());
    let tier: WelcomeBackTier = 'happy';
    if (absenceMs >= EMOTIONAL_MS) tier = 'emotional';
    else if (absenceMs >= SAD_MS) tier = 'sad';
    else if (absenceMs >= OFFENDED_MS) tier = 'offended';
    return { absenceMs, tier };
  }

  /** Pet activo del usuario (el más recientemente actualizado). */
  private async getActivePet(userId: string) {
    const pet = await this.prisma.pet.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    if (!pet) throw new NotFoundException('El usuario no tiene pets');
    return pet;
  }

  /**
   * Estado de la secuencia para el pet activo. Calcula tramo y plan, y refresca
   * `lastLoginAt` (el jugador está presente). Devuelve si la cinemática se activa.
   */
  async status(userId: string) {
    const pet = await this.getActivePet(userId);
    const now = new Date();
    const lastLogin = pet.lastLoginAt ?? pet.createdAt;

    // El jugador está presente → refrescar lastLoginAt.
    await this.prisma.pet.update({ where: { id: pet.id }, data: { lastLoginAt: now } });

    const { absenceMs, tier } = this.computeAbsence(lastLogin, now);
    const active = absenceMs >= MIN_ACTIVE_MS;

    const buffUntil = pet.recoveryBuffUntil;
    const buffActive = !!buffUntil && buffUntil.getTime() > now.getTime();

    return {
      petId: pet.id,
      nickname: pet.nickname,
      lastLoginAt: lastLogin,
      absenceMs,
      active,
      tier: active ? tier : null,
      plan: active ? this.planFor(tier) : null,
      recoveryBuff: buffActive
        ? { active: true, until: buffUntil, remainingMs: buffUntil!.getTime() - now.getTime() }
        : { active: false, until: null, remainingMs: 0 },
      alreadyCompleted:
        !!pet.lastWelcomeBackAt && now.getTime() - pet.lastWelcomeBackAt.getTime() < ANTI_SPAM_MS,
    };
  }

  /** Plan de ritual según el tramo. */
  private planFor(tier: WelcomeBackTier) {
    switch (tier) {
      case 'happy':
        return {
          tier,
          message: '¡Hola! ¿Cómo estás?',
          requiredActions: [] as string[],
          requiredClicks: 0,
          gift: false,
        };
      case 'offended':
        return {
          tier,
          message: 'Uff... me tocó esperar solo.',
          requiredActions: ['clicks'] as string[],
          requiredClicks: OFFENDED_CLICKS,
          chatKeyword: 'lo siento',
          gift: false,
        };
      case 'sad':
        return {
          tier,
          message: '...hola. Perdón. Yo también estaba triste.',
          requiredActions: ['feed', 'clean', 'minigame'] as string[],
          requiredClicks: 0,
          gift: false,
        };
      case 'emotional':
        return {
          tier,
          message: '¡¡¡TE ECHÉ DE MENOS!!! ...bueno, un poquito.',
          requiredActions: [] as string[],
          requiredClicks: 0,
          gift: true,
          giftRarity: ['rare', 'super_rare', 'legendary'],
          giftCoins: EMOTIONAL_COINS,
        };
    }
  }

  /** Genera y persiste el diario de ausencia para el pet activo. */
  async diary(userId: string) {
    const pet = await this.getActivePet(userId);
    const now = new Date();
    const lastLogin = pet.lastLoginAt ?? pet.createdAt;
    const { absenceMs } = this.computeAbsence(lastLogin, now);

    if (pet.absenceDiary) {
      const existing = pet.absenceDiary as unknown as DiaryEntry[];
      if (Array.isArray(existing) && existing.length > 0) {
        return { petId: pet.id, entries: existing, generatedAt: pet.updatedAt, cached: true };
      }
    }

    const entries = await this.diaryService.generate(pet.id, absenceMs, now);
    await this.prisma.pet.update({
      where: { id: pet.id },
      data: { absenceDiary: entries as object },
    });

    return { petId: pet.id, entries, generatedAt: now, cached: false };
  }

  /**
   * Completa el ritual de perdón del tramo y aplica el recovery buff (24h).
   * Para el tramo `emotional` además otorga un regalo.
   */
  async forgive(userId: string, action: ForgiveAction) {
    const pet = await this.getActivePet(userId);
    const now = new Date();
    const lastLogin = pet.lastLoginAt ?? pet.createdAt;
    const { absenceMs, tier } = this.computeAbsence(lastLogin, now);

    if (absenceMs < MIN_ACTIVE_MS) {
      throw new BadRequestException('La ausencia no alcanza el umbral (24h)');
    }
    if (pet.lastWelcomeBackAt && now.getTime() - pet.lastWelcomeBackAt.getTime() < ANTI_SPAM_MS) {
      throw new ConflictException('La secuencia ya se completó recientemente');
    }

    this.validateRitual(tier, action);

    const buffUntil = new Date(now.getTime() + RECOVERY_BUFF_MS);
    await this.prisma.pet.update({
      where: { id: pet.id },
      data: {
        recoveryBuffUntil: buffUntil,
        welcomeBackTier: tier,
        lastWelcomeBackAt: now,
        sleeping: false,
      },
    });

    await this.prisma.bondingEvent
      .create({
        data: { petId: pet.id, delta: 5, reason: 'welcome_back', value: pet.bonding + 5 },
      })
      .catch(() => undefined);
    await this.prisma.pet
      .update({ where: { id: pet.id }, data: { bonding: { increment: 5 } } })
      .catch(() => undefined);

    let gift = null;
    if (tier === 'emotional') gift = await this.grantGift(userId);

    return {
      message: 'Bueno... yo también te extrañé.',
      tier,
      recoveryBuff: { active: true, until: buffUntil, durationMs: RECOVERY_BUFF_MS },
      gift,
    };
  }

  /** Valida el ritual completado contra las exigencias del tramo. */
  private validateRitual(tier: WelcomeBackTier, action: ForgiveAction): void {
    const a = action ?? {};
    if (tier === 'offended') {
      const okClicks = (a.clicks ?? 0) >= OFFENDED_CLICKS;
      const okChat = typeof a.chat === 'string' && a.chat.toLowerCase().includes('lo siento');
      if (!okClicks && !okChat) {
        throw new BadRequestException(
          `Ritual de reconciliación incompleto (${OFFENDED_CLICKS} clicks o "lo siento")`,
        );
      }
    } else if (tier === 'sad') {
      const required = new Set(['feed', 'clean', 'minigame']);
      const done = new Set(a.actions ?? []);
      const missing = [...required].filter((x) => !done.has(x));
      if (missing.length > 0) {
        throw new BadRequestException(`Faltan acciones de cuidado: ${missing.join(', ')}`);
      }
    }
  }

  /** Regalo emocional: item de rareza ≥ rare + monedas (edge case sin item → 500 coins). */
  private async grantGift(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const coins = EMOTIONAL_COINS;
    if (user) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { coins: { increment: coins } },
      });
    }

    const candidates = await this.prisma.item.findMany({ where: { kind: 'gift' } });
    const item = candidates.find((c) =>
      JSON.stringify(c.effects).includes('rare'),
    );
    let itemId: string | null = null;
    if (item) {
      await this.prisma.inventoryItem
        .upsert({
          where: { userId_itemId: { userId, itemId: item.id } },
          update: { qty: { increment: 1 } },
          create: { userId, itemId: item.id, qty: 1 },
        })
        .catch(() => undefined);
      itemId = item.id;
    }

    return {
      itemId,
      coins,
      fallback: !itemId,
      coinsGranted: itemId ? coins : Math.max(coins, 500),
    };
  }
}

