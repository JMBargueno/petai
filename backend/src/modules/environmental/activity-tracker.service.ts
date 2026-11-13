import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { GameDataService } from '../game-data/game-data.service';
import { ActivityInfo, ActivityMode } from './environmental.types';
import { ACTIVITY_TTL_SECONDS } from './env-constants';

/** Cuerpo del heartbeat enviado por el escritorio. */
export interface ActivityHeartbeatInput {
  active?: boolean;
  cpuUsage?: number | null;
}

/** Valor serializado en Redis `activity:{userId}`. */
interface StoredActivity {
  lastActiveAt: string;
  active: boolean;
  cpuUsage?: number;
}

/**
 * Registro de actividad del PC del usuario (heartbeat del escritorio). Guarda la última actividad en
 * Redis `activity:{userId}` (TTL 3 h, expira sola sin cola) y clasifica `active`/`solo` según el
 * umbral `balance.environmental.inactivityThresholdHours`.
 */
@Injectable()
export class ActivityTrackerService {
  private readonly logger = new Logger(ActivityTrackerService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly gameData: GameDataService,
  ) {}

  private key(userId: string): string {
    return this.redis.key(`activity:${userId}`);
  }

  private thresholdHours(): number {
    const t = this.gameData.getBalance()?.environmental?.inactivityThresholdHours;
    return typeof t === 'number' && t > 0 ? t : 2;
  }

  /**
   * Registra un heartbeat: fija `lastActiveAt = now` (TTL 3 h) y detecta la transición
   * `solo` → `active` (usuario que regresa). `transitionedToActive` indica si se emitió el
   * `environmental:changed` de retorno.
   */
  async recordHeartbeat(userId: string, input: ActivityHeartbeatInput): Promise<{ transitionedToActive: boolean }> {
    const threshold = this.thresholdHours();
    const now = new Date();
    const nowIso = now.toISOString();

    // ¿Antes estaba "solo"? Se compara el último `lastActiveAt` contra el umbral.
    const previous = await this.read(userId);
    const wasSolo = previous ? this.modeFrom(previous.lastActiveAt, threshold, now) === 'solo' : false;

    const cpu = this.normalizeCpu(input?.cpuUsage);
    const payload: StoredActivity = { lastActiveAt: nowIso, active: input?.active !== false };
    if (cpu !== undefined) payload.cpuUsage = cpu;

    await this.redis.run((r) => r.set(this.key(userId), JSON.stringify(payload), 'EX', ACTIVITY_TTL_SECONDS), 'activity.set');

    return { transitionedToActive: wasSolo };
  }

  /** Estado de actividad para `GET /environmental/status`. */
  async getStatus(userId: string): Promise<ActivityInfo> {
    const threshold = this.thresholdHours();
    const now = new Date();
    const stored = await this.read(userId);
    if (!stored) {
      // Sin heartbeat: no hay evidencia de inactividad → se considera activo.
      return { active: true, mode: 'active', lastActiveAt: null };
    }
    const lastActiveAt = stored.lastActiveAt;
    const mode = this.modeFrom(lastActiveAt, threshold, now);
    return { active: mode === 'active', mode, lastActiveAt };
  }

  /** Clasifica `active`/`solo` a partir del último heartbeat y el umbral (horas). */
  private modeFrom(lastActiveAt: string | null, thresholdHours: number, now: Date): ActivityMode {
    if (!lastActiveAt) return 'active';
    const last = new Date(lastActiveAt).getTime();
    if (Number.isNaN(last)) return 'active';
    const elapsedHours = (now.getTime() - last) / 3_600_000;
    return elapsedHours > thresholdHours ? 'solo' : 'active';
  }

  /** `cpuUsage` solo se guarda si es un número finito ≥ 0 (no se guarda basura). */
  private normalizeCpu(value: number | null | undefined): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
    return value;
  }

  private async read(userId: string): Promise<StoredActivity | null> {
    const raw = await this.redis.run((r) => r.get(this.key(userId)), 'activity.get');
    if (typeof raw !== 'string') return null;
    try {
      const parsed = JSON.parse(raw) as StoredActivity;
      if (!parsed || typeof parsed.lastActiveAt !== 'string') return null;
      return parsed;
    } catch (err) {
      this.logger.debug(`Clave de actividad corrupta para ${userId}: ${(err as Error).message}`);
      return null;
    }
  }
}
