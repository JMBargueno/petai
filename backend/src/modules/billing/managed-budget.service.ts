import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from '../../redis/redis.service';
import { BillingConfigService } from './billing-config.service';
import { Plan } from './plans';

/**
 * Reserva atómica de presupuesto: comprueba y suma en un solo paso (sin carreras entre réplicas).
 * Devuelve el gasto tras reservar o -1 si el presupuesto ya está agotado.
 */
const RESERVE_LUA = `
local cur = tonumber(redis.call('GET', KEYS[1]) or '0')
if cur >= tonumber(ARGV[2]) then return -1 end
local total = redis.call('INCRBY', KEYS[1], ARGV[1])
if total == tonumber(ARGV[1]) then redis.call('EXPIRE', KEYS[1], 172800) end
return total`;

/** Plazas de stream gestionado: ZSET miembro→inicio; las plazas de streams abandonados caducan solas. */
const SLOT_TTL_MS = 5 * 60_000;
const ACQUIRE_SLOT_LUA = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', tonumber(ARGV[3]) - tonumber(ARGV[4]))
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[1]) then return -1 end
redis.call('ZADD', KEYS[1], ARGV[3], ARGV[2])
redis.call('PEXPIRE', KEYS[1], ARGV[4])
return 1`;

@Injectable()
export class ManagedBudgetService {
  private readonly logger = new Logger(ManagedBudgetService.name);
  // Respaldo por instancia si Redis cae: el presupuesto nunca queda sin control (no falla en abierto)
  private readonly memorySpend = new Map<string, number>();
  private readonly memorySlots = new Map<string, number>();

  constructor(
    private readonly redis: RedisService,
    private readonly billingConfig: BillingConfigService,
  ) {}

  private getUtcDateKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Comprueba si la IA gestionada está habilitada, si el circuit breaker está abierto
   * o si se ha superado el presupuesto diario global para el plan del usuario.
   */
  async assertOpen(plan: Plan): Promise<void> {
    const settings = this.billingConfig.managedAiSettings();

    if (!settings.enabled) {
      throw new HttpException(
        {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          code: 'managed_ai_paused',
          message: 'La IA de Pockai está pausada temporalmente.',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // Comprobación de circuit breaker
    const circuitKey = this.redis.key('managed:circuit');
    const isCircuitOpen = await this.redis.run(async (r) => {
      return r.exists(circuitKey);
    }, 'circuit_check').catch(() => 0);

    if (isCircuitOpen === 1) {
      throw new HttpException(
        {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          code: 'managed_ai_unavailable',
          retryAfter: 60,
          message: 'La IA de Pockai está descansando, vuelve en un momento.',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // Comprobación de presupuesto diario global en micro-USD (1 USD = 1.000.000 micro-USD)
    const day = this.getUtcDateKey();
    const spendKey = this.redis.key(`managed:spend:${day}`);

    const fromRedis = await this.redis.run(async (r) => {
      const val = await r.get(spendKey);
      return val ? parseInt(val, 10) : 0;
    }, 'spend_check').catch(() => null);
    const currentMicroSpend = fromRedis ?? this.memorySpend.get(day) ?? 0;

    const maxMicroForPlan = this.maxMicroFor(plan);

    if (currentMicroSpend >= maxMicroForPlan) {
      this.logger.warn(
        `Presupuesto diario de IA gestionada alcanzado para plan ${plan}: ${currentMicroSpend / 1e6} $ / ${maxMicroForPlan / 1e6} $`,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          code: 'managed_ai_paused',
          message:
            plan === 'pro'
              ? 'Límite de presupuesto diario alcanzado. Por favor, reintenta más tarde.'
              : 'La IA gratuita ha alcanzado el límite diario global. Hazte Pro o usa tu propia API key para continuar.',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Suma el coste de una llamada completada al acumulador de gasto diario.
   */
  async add(costUsd: number): Promise<void> {
    if (!costUsd || costUsd <= 0) return;
    await this.addMicro(Math.round(costUsd * 1_000_000));
  }

  private maxMicroFor(plan: Plan): number {
    const settings = this.billingConfig.managedAiSettings();
    const baseBudgetMicro = settings.dailyBudgetUsd * 1_000_000;
    return plan === 'pro' ? baseBudgetMicro * (settings.proBudgetMultiplier || 1.5) : baseBudgetMicro;
  }

  /**
   * Comprueba y reserva de forma atómica el coste estimado de una llamada. Devuelve los micro-USD
   * reservados, que se ajustan al coste real con `settle` al terminar.
   */
  async reserve(plan: Plan, estimateUsd: number): Promise<number> {
    await this.assertOpen(plan);
    const microUsd = Math.max(0, Math.round(estimateUsd * 1_000_000));
    const day = this.getUtcDateKey();
    const spendKey = this.redis.key(`managed:spend:${day}`);
    const max = this.maxMicroFor(plan);

    const result = await this.redis
      .run(async (r) => r.eval(RESERVE_LUA, 1, spendKey, String(microUsd), String(max)), 'spend_reserve')
      .catch(() => null);

    let total: number;
    if (result === null || result === undefined) {
      const cur = this.memorySpend.get(day) ?? 0;
      total = cur >= max ? -1 : cur + microUsd;
      if (total >= 0) this.memorySpend.set(day, total);
    } else {
      total = Number(result);
    }
    if (total < 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          code: 'managed_ai_paused',
          message:
            plan === 'pro'
              ? 'Límite de presupuesto diario alcanzado. Por favor, reintenta más tarde.'
              : 'La IA gratuita ha alcanzado el límite diario global. Hazte Pro o usa tu propia API key para continuar.',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return microUsd;
  }

  /**
   * Semáforo global de streams simultáneos de IA gestionada (`managedAi.maxConcurrency`).
   * Cada plaza caduca a los 5 min por si un stream se abandona o una réplica muere sin liberar.
   * Devuelve el identificador de la plaza para `releaseSlot`.
   */
  async acquireSlot(): Promise<string> {
    const max = this.billingConfig.managedAiSettings().maxConcurrency;
    const key = this.redis.key('managed:inflight');
    const member = randomUUID();
    const now = Date.now();
    const result = await this.redis
      .run(
        async (r) => r.eval(ACQUIRE_SLOT_LUA, 1, key, String(max), member, String(now), String(SLOT_TTL_MS)),
        'managed_slot_acquire',
      )
      .catch(() => null);
    let ok: boolean;
    if (result === null || result === undefined) {
      for (const [m, t] of this.memorySlots) if (t < now - SLOT_TTL_MS) this.memorySlots.delete(m);
      ok = this.memorySlots.size < max;
      if (ok) this.memorySlots.set(member, now);
    } else {
      ok = Number(result) >= 0;
    }
    if (!ok) {
      throw new HttpException(
        {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          code: 'managed_ai_busy',
          retryAfter: 5,
          message: 'Hay mucha gente hablando con su Pockai ahora mismo; reintenta en unos segundos.',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return member;
  }

  async releaseSlot(member: string): Promise<void> {
    this.memorySlots.delete(member);
    const key = this.redis.key('managed:inflight');
    await this.redis.run(async (r) => r.zrem(key, member), 'managed_slot_release').catch(() => null);
  }

  /** Coste conservador según los precios de estimación de la configuración (USD). */
  estimateCostUsd(promptTokens: number, completionTokens: number): number {
    const s = this.billingConfig.managedAiSettings();
    return (
      (Math.max(0, promptTokens) * (s.estimatePromptUsdPerMTok ?? 0.5) +
        Math.max(0, completionTokens) * (s.estimateCompletionUsdPerMTok ?? 2)) /
      1_000_000
    );
  }

  /** Ajusta una reserva al coste real (devuelve presupuesto si se gastó menos de lo estimado). */
  async settle(reservedMicro: number, actualUsd: number): Promise<void> {
    const delta = Math.round(Math.max(0, actualUsd) * 1_000_000) - reservedMicro;
    if (delta !== 0) await this.addMicro(delta);
  }

  private async addMicro(microUsd: number): Promise<void> {
    const day = this.getUtcDateKey();
    const spendKey = this.redis.key(`managed:spend:${day}`);

    const ok = await this.redis.run(async (r) => {
      const total = await r.incrby(spendKey, microUsd);
      if (total === microUsd) {
        await r.expire(spendKey, 172800); // 48 horas
      }
      return true;
    }, 'spend_add').catch(() => null);
    if (ok === null) {
      this.memorySpend.set(day, Math.max(0, (this.memorySpend.get(day) ?? 0) + microUsd));
    }
  }

  /**
   * Devuelve el gasto acumulado en USD en el día actual (UTC).
   */
  async getDailySpendUsd(): Promise<number> {
    const day = this.getUtcDateKey();
    const spendKey = this.redis.key(`managed:spend:${day}`);
    const micro = await this.redis.run(async (r) => {
      const val = await r.get(spendKey);
      return val ? parseInt(val, 10) : 0;
    }, 'spend_get').catch(() => null);
    return (micro ?? this.memorySpend.get(day) ?? 0) / 1_000_000;
  }

  /**
   * Registra un fallo en OpenRouter para evaluar la apertura del circuit breaker.
   */
  async recordFailure(): Promise<void> {
    const failKey = this.redis.key('managed:fails:window');
    const circuitKey = this.redis.key('managed:circuit');

    await this.redis.run(async (r) => {
      const fails = await r.incr(failKey);
      if (fails === 1) {
        await r.expire(failKey, 60);
      }
      if (fails >= 5) {
        this.logger.error('Circuit breaker activado para IA gestionada por fallos consecutivos');
        await r.set(circuitKey, 'open', 'EX', 60);
      }
    }, 'circuit_record_fail').catch(() => undefined);
  }

  async recordSuccess(): Promise<void> {
    const failKey = this.redis.key('managed:fails:window');
    await this.redis.run(async (r) => {
      await r.del(failKey);
    }, 'del').catch(() => undefined);
  }
}
