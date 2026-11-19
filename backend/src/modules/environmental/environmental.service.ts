import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RedisService } from '../../redis/redis.service';
import { ActivityTrackerService, ActivityHeartbeatInput } from './activity-tracker.service';
import { FestivalService } from './festival.service';
import { calendarDayOf, safeTimeZone, timeOfDay } from './time-of-day';
import {
  ActivityMode,
  EnvironmentalStatus,
  FestivalInfo,
  TimeOfDay,
  UpcomingFestival,
  WeatherInfo,
} from './environmental.types';

/**
 * El servidor ya no conoce la ubicación del usuario: cada app la lee del sistema y pide el clima
 * a Open-Meteo desde el propio dispositivo (`@pockai/scene/weather`). Se mantiene el campo
 * `weather` en la respuesta, siempre `unknown`, para que los clientes antiguos sigan leyéndola.
 */
export const UNKNOWN_WEATHER: WeatherInfo = {
  condition: 'unknown',
  temperature: null,
  weatherCode: null,
  cached: false,
  fetchedAt: null,
  sunrise: null,
  sunset: null,
};

/** Estado ambiental recordado por usuario (para detectar transiciones y emitir el WS). */
interface LastEnv {
  timeOfDay?: TimeOfDay;
  mode?: ActivityMode;
  festivalId?: string | null;
}

/** Caducidad del estado ambiental en Redis (R-02): 24 h, suficiente para cubrir el ciclo timeOfDay. */
const LAST_ENV_TTL_S = 24 * 60 * 60;

/**
 * Orquestador del estado ambiental: compone `{ timeOfDay, weather, activity, festival }` a partir de
 * los servicios (hora, clima, actividad, festividad) y emite `environmental:changed` cuando cambia una
 * condición relevante. `userId` proviene siempre de la sesión (JWT), nunca del cliente (Constitución I).
 */
@Injectable()
export class EnvironmentalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityTrackerService,
    private readonly festival: FestivalService,
    private readonly realtime: RealtimeGateway,
    private readonly redis: RedisService,
  ) {}

  /**
   * Estado ambiental anterior por usuario, en Redis con caducidad (R-02): compartido entre
   * réplicas (la transición se detecta aunque la petición caiga en otra réplica) y acotado en
   * memoria (TTL → no crece sin límite como el Map en memoria de antes). Si Redis no responde,
   * `loadLastEnv` devuelve null y `saveLastEnv` es no-op: se pierde la detección de transición de
   * ese ciclo (no crítico: son avisos en vivo, no estado de juego).
   */
  private envKey(userId: string): string {
    return this.redis.key(`env:last:${userId}`);
  }

  private async loadLastEnv(userId: string): Promise<LastEnv | null> {
    return this.redis.run(async (r) => {
      const raw = await r.get(this.envKey(userId));
      if (raw === null || raw === undefined) return null;
      try {
        return JSON.parse(raw) as LastEnv;
      } catch {
        return null;
      }
    }, 'env.load');
  }

  private async saveLastEnv(userId: string, env: LastEnv): Promise<void> {
    await this.redis.run((r) => r.set(this.envKey(userId), JSON.stringify(env), 'EX', LAST_ENV_TTL_S), 'env.save');
  }

  /** Compone el estado ambiental del usuario y avisa por WS de las transiciones relevantes. */
  async getStatus(userId: string): Promise<EnvironmentalStatus> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true, birthday: true },
    });

    const tz = safeTimeZone(user?.timezone ?? null);
    const now = new Date();

    const tod = timeOfDay(now, tz);
    const weather = { ...UNKNOWN_WEATHER };
    const activity = await this.activity.getStatus(userId);
    const day = calendarDayOf(now, tz);
    // v1: sin campo de región en User → solo festividades globales.
    const festival = this.festival.getActive(day, null);

    const status: EnvironmentalStatus = { timeOfDay: tod, weather, activity, festival };
    await this.emitTransitions(userId, status);
    return status;
  }

  /** Registra un heartbeat y emite `environmental:changed` si se regresa de `solo` a `active`. */
  async recordActivity(userId: string, input: ActivityHeartbeatInput): Promise<{ ok: true }> {
    const { transitionedToActive } = await this.activity.recordHeartbeat(userId, input);
    if (transitionedToActive) {
      const prev = await this.loadLastEnv(userId);
      if (prev && prev.mode === 'solo') {
        this.realtime.emitToUser(userId, 'environmental:changed', {
          type: 'activity',
          data: { mode: 'active' as ActivityMode },
        });
        await this.saveLastEnv(userId, { ...prev, mode: 'active' });
      }
    }
    return { ok: true };
  }

  /** Próximas festividades (incluida la de hoy) para el usuario. */
  async getUpcomingFestivals(userId: string): Promise<UpcomingFestival[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true, birthday: true },
    });
    const day = calendarDayOf(new Date(), safeTimeZone(user?.timezone ?? null));
    // v1: sin campo de región en User → solo festividades globales + cumpleaños.
    return this.festival.getUpcoming(day, { region: null, birthday: user?.birthday ?? null });
  }

  /** Emite el WS solo si alguna condición relevante cambió respecto al último estado recordado. */
  private async emitTransitions(userId: string, status: EnvironmentalStatus) {
    const prev = await this.loadLastEnv(userId);
    const festivalId = status.festival ? status.festival.id : null;

    if (prev) {
      if (prev.timeOfDay !== undefined && prev.timeOfDay !== status.timeOfDay) {
        this.realtime.emitToUser(userId, 'environmental:changed', {
          type: 'timeOfDay',
          data: { timeOfDay: status.timeOfDay },
        });
      }
      if (prev.mode !== undefined && prev.mode !== status.activity.mode) {
        this.realtime.emitToUser(userId, 'environmental:changed', {
          type: 'activity',
          data: { mode: status.activity.mode },
        });
      }
      if (prev.festivalId !== undefined && prev.festivalId !== festivalId) {
        this.realtime.emitToUser(userId, 'environmental:changed', {
          type: 'festival',
          data: status.festival as FestivalInfo | null,
        });
      }
    }

    await this.saveLastEnv(userId, {
      timeOfDay: status.timeOfDay,
      mode: status.activity.mode,
      festivalId,
    });
  }
}
