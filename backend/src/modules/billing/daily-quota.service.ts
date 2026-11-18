import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { BillingConfigService } from './billing-config.service';
import { Plan } from './plans';

const CONSUME_LUA = `
local used = redis.call('INCR', KEYS[1])
if used == 1 then redis.call('EXPIRE', KEYS[1], 172800) end
if used > tonumber(ARGV[1]) then
  redis.call('DECR', KEYS[1])
  return -1
end
return used`;

/**
 * Fecha de cuota monótona por usuario: nunca retrocede. Cambiar la zona horaria a una más al oeste
 * no reabre un día ya consumido (se sigue usando el día más reciente hasta que el local lo alcance).
 */
const MONOTONIC_DATE_LUA = `
local last = redis.call('GET', KEYS[1])
local date = ARGV[1]
if last and last > date then date = last end
redis.call('SET', KEYS[1], date, 'EX', 259200)
return date`;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const REFUND_LUA = `
local val = redis.call('GET', KEYS[1])
if val and tonumber(val) > 0 then
  return redis.call('DECR', KEYS[1])
end
return 0`;

export function nextLocalMidnight(timeZone = 'UTC'): string {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    }).formatToParts(now);

    const map: Record<string, number> = {};
    for (const p of parts) {
      if (p.type !== 'literal') map[p.type] = parseInt(p.value, 10);
    }

    const currentHour = map.hour === 24 ? 0 : map.hour;
    const secondsSinceMidnight = currentHour * 3600 + map.minute * 60 + map.second;
    const secondsUntilMidnight = Math.max(1, 86400 - secondsSinceMidnight);

    const nextMidnight = new Date(now.getTime() + secondsUntilMidnight * 1000);
    return nextMidnight.toISOString();
  } catch {
    const d = new Date();
    d.setUTCHours(24, 0, 0, 0);
    return d.toISOString();
  }
}

@Injectable()
export class DailyQuotaService {
  private readonly logger = new Logger(DailyQuotaService.name);
  // Respaldo en memoria por instancia si Redis no está disponible
  private readonly memoryDailyHits = new Map<string, number>();
  private readonly memoryLastDate = new Map<string, string>();

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly billingConfig: BillingConfigService,
  ) {}

  /**
   * Obtiene la clave del día y el momento de reseteo según la zona horaria del usuario.
   */
  async day(userId: string): Promise<{ key: string; rawKey: string; resetsAt: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    const timezone = user?.timezone || 'UTC';
    let localDate: string;
    try {
      localDate = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
    } catch {
      localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(new Date());
    }

    // La fecha efectiva nunca retrocede (antiabuso: cambiar de zona horaria no regala cupos)
    const lastKey = this.redis.key(`daily:last:${userId}`);
    const fromRedis = await this.redis
      .run(async (r) => r.eval(MONOTONIC_DATE_LUA, 1, lastKey, localDate), 'daily_quota_date')
      .catch(() => null);
    let date: string;
    if (typeof fromRedis === 'string' && ISO_DATE.test(fromRedis)) {
      date = fromRedis;
    } else {
      const last = this.memoryLastDate.get(userId);
      date = last && last > localDate ? last : localDate;
      this.memoryLastDate.set(userId, date);
    }

    const rawKey = `daily:${userId}:${date}`;
    const key = this.redis.key(rawKey);
    // Si la fecha efectiva va por delante de la local, el reseteo llega cuando el día local la alcance
    const daysAhead = Math.max(0, Math.round((Date.parse(date) - Date.parse(localDate)) / 86_400_000));
    const resetsAt = new Date(Date.parse(nextLocalMidnight(timezone)) + daysAhead * 86_400_000).toISOString();
    return { key, rawKey, resetsAt };
  }

  /**
   * Consume 1 mensaje del contador diario del usuario de forma atómica.
   * Si supera el límite permitido, lanza 429 con daily_quota_exceeded.
   */
  async consume(userId: string, plan: Plan): Promise<{ used: number; limit: number; resetsAt: string; key: string }> {
    const limits = await this.billingConfig.limits(plan);
    const limit = limits.dailyMessages;
    const { key, rawKey, resetsAt } = await this.day(userId);

    // Intentar operación atómica en Redis
    const redisResult = await this.redis.run(async (r) => {
      return r.eval(CONSUME_LUA, 1, key, String(limit));
    }, 'daily_quota_consume');

    if (redisResult !== null) {
      const used = Number(redisResult);
      if (used < 0) {
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            code: 'daily_quota_exceeded',
            plan,
            limit,
            resetsAt,
            message: 'Has usado todos tus mensajes de hoy.',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return { used, limit, resetsAt, key };
    }

    // Fallback: Redis caído -> Respaldo en memoria. NUNCA falla en abierto para Free
    this.logger.warn(`Redis no disponible para cuota diaria; usando fallback en memoria para ${userId}`);
    const currentMemoryUsed = this.memoryDailyHits.get(rawKey) ?? 0;
    if (currentMemoryUsed >= limit) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'daily_quota_exceeded',
          plan,
          limit,
          resetsAt,
          message: 'Has usado todos tus mensajes de hoy.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const newUsed = currentMemoryUsed + 1;
    this.memoryDailyHits.set(rawKey, newUsed);
    return { used: newUsed, limit, resetsAt, key: rawKey };
  }

  /**
   * Reembolsa un mensaje si el proveedor falló antes de emitir texto.
   */
  async refund(key: string): Promise<void> {
    const redisResult = await this.redis.run(async (r) => {
      return r.eval(REFUND_LUA, 1, key);
    }, 'daily_quota_refund');

    if (redisResult === null) {
      // Fallback memoria
      const current = this.memoryDailyHits.get(key) ?? 0;
      if (current > 0) {
        this.memoryDailyHits.set(key, current - 1);
      }
    }
  }

  /**
   * Consulta el uso actual sin consumir.
   */
  async peek(userId: string, plan: Plan): Promise<{ used: number; limit: number; resetsAt: string }> {
    const limits = await this.billingConfig.limits(plan);
    const limit = limits.dailyMessages;
    const { key, rawKey, resetsAt } = await this.day(userId);

    const redisVal = await this.redis.run(async (r) => {
      return r.get(key);
    }, 'daily_quota_peek');

    let used = 0;
    if (redisVal !== null && redisVal !== undefined) {
      used = Number(redisVal);
    } else {
      used = this.memoryDailyHits.get(rawKey) ?? 0;
    }

    return { used, limit, resetsAt };
  }

  /**
   * Reinicia el contador para tests.
   */
  async resetForTest(userId: string) {
    const { key, rawKey } = await this.day(userId);
    this.memoryDailyHits.delete(rawKey);
    await this.redis.run(async (r) => {
      await r.del(key);
    }, 'del').catch(() => undefined);
  }
}
