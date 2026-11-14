import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { GameDataService } from '../game-data/game-data.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationGeneratorService } from './notification-generator.service';
import {
  resolveDefaults,
  isInQuietHours,
  shouldRateLimit,
  shouldDedup,
  CATEGORY_TO_TYPE,
  NotificationCategory,
} from './notification-rules';

/** Días (en ms) de vigencia del counter diario de rate limit. */
const RATE_LIMIT_TTL_MS = 24 * 3600 * 1000;

/** Evento de dominio → categoría de notificación (contrato de api-contract.md). */
type DomainEvent = { userId: string; petId?: string; [k: string]: unknown };

/**
 * Orquestador de notificaciones con personalidad (feature 007). Decide **SI** notificar (toggle,
 * quiet hours, dedup, rate limit) y, si pasa, genera el mensaje y lo emite por WS `pet:notification`.
 *
 * Se suscribe a los eventos de dominio vía `@OnEvent` (los emiten `pets`, `battles` y `missions`).
 * La identidad (`userId`, `petId`) siempre proviene de los eventos internos, nunca del cliente.
 */
@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly gameData: GameDataService,
    private readonly generator: NotificationGeneratorService,
    private readonly realtime: RealtimeGateway,
    private readonly config: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Suscripciones a eventos de dominio (fire-and-forget: un fallo no rompe el emisor)
  // ---------------------------------------------------------------------------

  @OnEvent('pet:vitals-critical', { async: true })
  onVitalsCritical(p: DomainEvent) {
    return this.safeDispatch(p.userId, p.petId, 'vitals_critical', p);
  }

  @OnEvent('pet:interaction', { async: true })
  onInteraction(p: DomainEvent) {
    return this.safeDispatch(p.userId, p.petId, 'interaction', p);
  }

  @OnEvent('pet:fed', { async: true })
  onFed(p: DomainEvent) {
    return this.safeDispatch(p.userId, p.petId, 'interaction', p);
  }

  @OnEvent('pet:cleaned', { async: true })
  onCleaned(p: DomainEvent) {
    return this.safeDispatch(p.userId, p.petId, 'interaction', p);
  }

  @OnEvent('pet:slept', { async: true })
  onSlept(p: DomainEvent) {
    return this.safeDispatch(p.userId, p.petId, 'interaction', p);
  }

  @OnEvent('pet:mission-completed', { async: true })
  onMissionCompleted(p: DomainEvent) {
    return this.safeDispatch(p.userId, p.petId, 'achievement', p);
  }

  @OnEvent('pet:level_up', { async: true })
  onLevelUp(p: DomainEvent) {
    return this.safeDispatch(p.userId, p.petId, 'achievement', p);
  }

  @OnEvent('pet:evolved', { async: true })
  onEvolved(p: DomainEvent) {
    return this.safeDispatch(p.userId, p.petId, 'achievement', p);
  }

  @OnEvent('pet:battle-won', { async: true })
  onBattleWon(p: DomainEvent) {
    return this.safeDispatch(p.userId, p.petId, 'arena', p);
  }

  @OnEvent('pet:battle-lost', { async: true })
  onBattleLost(p: DomainEvent) {
    return this.safeDispatch(p.userId, p.petId, 'arena', p);
  }

  @OnEvent('event:global', { async: true })
  onGlobalEvent(p: DomainEvent) {
    return this.safeDispatch(p.userId, p.petId, 'event', p);
  }

  // ---------------------------------------------------------------------------
  // Lógica de decisión + emisión
  // ---------------------------------------------------------------------------

  /** Envuelve `dispatch` para que un error nunca propague al emisor del evento. */
  private async safeDispatch(
    userId?: string,
    petId?: string,
    category?: NotificationCategory,
    context?: Record<string, unknown>,
  ) {
    if (!userId || !category) return;
    try {
      await this.dispatch(userId, petId, category, context ?? {});
    } catch (err: any) {
      this.logger.warn(`Dispatch de notificación falló (${category}): ${err?.message}`);
    }
  }

  /**
   * Decide SI notificar y, si pasa, genera y emite. Orden: (1) toggle por prefs → (2) quiet hours
   * → (3) dedup (5 min) → (4) rate limit (INCR+EXPIRE 24h) → (5) generar + emitir → (6) fijar dedup.
   * Devuelve `true` si se emitió, `false` si fue descartada.
   */
  async dispatch(
    userId: string,
    petId: string | undefined,
    category: NotificationCategory,
    context: Record<string, unknown> = {},
    now: Date = new Date(),
  ): Promise<boolean> {
    const config = this.gameData.getNotificationConfig();

    // (1) Usuario: prefs + zona horaria. Si no existe, no se notifica.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true, notificationPrefs: true },
    });
    if (!user) return false;

    // Toggle por categoría (prefs resueltas sobre defaults si es null).
    const prefs = resolveDefaults(user.notificationPrefs as never);
    if (!prefs[category]) return false;

    // (2) Quiet hours (23:00-07:00 local del usuario, configurable).
    if (isInQuietHours(now, user.timezone, config.quietStart, config.quietEnd)) return false;

    // Si el evento no trae petId (p. ej. misiones, que son por usuario), se resuelve el pet principal.
    const resolvedPetId = petId ?? (await this.primaryPetId(userId));
    if (!resolvedPetId) return false;

    // (3) Dedup: misma categoría dentro de la ventana (Redis TTL).
    const dedupKey = this.dedupKey(userId, resolvedPetId, category);
    const lastEmitAt = (await this.redis.run((r) => r.get(dedupKey), 'dedup:read')) as string | null;
    if (shouldDedup(lastEmitAt ? Number(lastEmitAt) : null, config.dedupWindowMs, now.getTime())) return false;

    // (4) Rate limit: counter diario (INCR + EXPIRE). Solo se contabiliza al superar quiet/toggle/dedup.
    const effectiveMaxPerDay = this.effectiveMaxPerDay(user.notificationPrefs);
    if (await this.isRateLimited(userId, effectiveMaxPerDay, user.timezone, now)) return false;

    // (5) Generar el mensaje (IA o plantilla) y emitir por WS.
    const { message, source } = await this.generator.generate(resolvedPetId, userId, category, context);
    const pet = await this.prisma.pet.findFirst({
      where: { id: resolvedPetId, userId },
      select: { nickname: true },
    });
    const payload = {
      petId: resolvedPetId,
      petName: pet?.nickname ?? 'Tu mascota',
      type: CATEGORY_TO_TYPE[category],
      message,
      category,
      source,
      timestamp: now.toISOString(),
    };
    this.realtime.emitToUser(userId, 'pet:notification', payload);

    // (6) Fijar la clave de dedup con TTL (marca el envío para la ventana).
    await this.redis
      .run(
        (r) => r.set(dedupKey, String(now.getTime()), 'EX', Math.max(1, Math.ceil(config.dedupWindowMs / 1000))),
        'dedup:set',
      )
      .catch(() => undefined);

    return true;
  }

  /**
   * Tope diario efectivo: el `maxPerDay` explícito del usuario (1-10) tiene prioridad; si no lo fijó,
   * se usa el override opcional de entorno `NOTIFICATIONS_DEFAULT_MAX_PER_DAY` o, en su defecto, el
   * default de `balance.notifications.rateLimit.defaultMaxPerDay`.
   */
  private effectiveMaxPerDay(stored: unknown): number {
    const explicit = (stored as { maxPerDay?: unknown } | null | undefined)?.maxPerDay;
    if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit >= 1 && explicit <= 10) {
      return Math.trunc(explicit);
    }
    const env = this.config.get<string>('NOTIFICATIONS_DEFAULT_MAX_PER_DAY');
    const envNum = env ? parseInt(env, 10) : NaN;
    if (Number.isFinite(envNum) && envNum >= 1 && envNum <= 10) return envNum;
    return this.gameData.getNotificationConfig().defaultMaxPerDay;
  }

  /** Counter diario: `INCR notify:count:{userId}:{fecha-local}`; al primer uso, `EXPIRE` 24h. */
  private async isRateLimited(userId: string, maxPerDay: number, timezone: string, now: Date): Promise<boolean> {
    const dateKey = this.localDateKey(now, timezone);
    const counterKey = this.redis.key(`notify:count:${userId}:${dateKey}`);
    const count = await this.redis.run(async (r) => {
      const n = await r.incr(counterKey);
      if (n === 1) await r.expire(counterKey, Math.ceil(RATE_LIMIT_TTL_MS / 1000));
      return n;
    }, 'rate:incr');

    if (count === null) {
      // Redis caído: degradamos a no-límite (la notificación no se pierde).
      this.logger.debug('Redis no disponible: se omite el rate limit para esta notificación');
      return false;
    }
    // `count` es el valor tras incrementar; el recuento previo fue `count - 1`.
    return shouldRateLimit(count - 1, maxPerDay);
  }

  /** Primer pet del usuario (para eventos sin petId, como misiones). */
  private async primaryPetId(userId: string): Promise<string | null> {
    const pet = await this.prisma.pet.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return pet?.id ?? null;
  }

  private dedupKey(userId: string, petId: string, category: NotificationCategory): string {
    return this.redis.key(`notify:dedup:${userId}:${petId}:${category}`);
  }

  /** Fecha local (YYYY-MM-DD) del usuario para el counter diario; respaldo a UTC. */
  private localDateKey(date: Date, timezone: string): string {
    try {
      const tz = timezone && this.isValidTimeZone(timezone) ? timezone : 'UTC';
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date);
    } catch {
      return date.toISOString().slice(0, 10);
    }
  }

  private isValidTimeZone(timeZone: string): boolean {
    try {
      new Intl.DateTimeFormat('en-GB', { timeZone });
      return true;
    } catch {
      return false;
    }
  }
}
