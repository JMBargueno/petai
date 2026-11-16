import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { BillingConfigService } from './billing-config.service';
import { Plan } from './plans';

@Injectable()
export class ManagedBudgetService {
  private readonly logger = new Logger(ManagedBudgetService.name);

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

    const currentMicroSpend = await this.redis.run(async (r) => {
      const val = await r.get(spendKey);
      return val ? parseInt(val, 10) : 0;
    }, 'spend_check').catch(() => 0);

    const baseBudgetMicro = settings.dailyBudgetUsd * 1_000_000;
    const maxMicroForPlan =
      plan === 'pro' ? baseBudgetMicro * (settings.proBudgetMultiplier || 1.5) : baseBudgetMicro;

    if (currentMicroSpend !== null && currentMicroSpend >= maxMicroForPlan) {
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
    const microUsd = Math.round(costUsd * 1_000_000);
    const day = this.getUtcDateKey();
    const spendKey = this.redis.key(`managed:spend:${day}`);

    await this.redis.run(async (r) => {
      const total = await r.incrby(spendKey, microUsd);
      if (total === microUsd) {
        await r.expire(spendKey, 172800); // 48 horas
      }
    }, 'spend_add').catch(() => undefined);
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
    }, 'spend_get').catch(() => 0);
    return (micro || 0) / 1_000_000;
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
