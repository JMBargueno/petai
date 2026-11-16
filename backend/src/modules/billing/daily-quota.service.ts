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

    const rawKey = `daily:${userId}:${localDate}`;
    const key = this.redis.key(rawKey);
    const resetsAt = nextLocalMidnight(timezone);
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
