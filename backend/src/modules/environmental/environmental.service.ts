import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WeatherService } from './weather.service';
import { ActivityTrackerService, ActivityHeartbeatInput } from './activity-tracker.service';
import { FestivalService } from './festival.service';
import { calendarDayOf, safeTimeZone, timeOfDay } from './time-of-day';
import {
  ActivityMode,
  EnvironmentalStatus,
  FestivalInfo,
  TimeOfDay,
  UpcomingFestival,
  WeatherCondition,
} from './environmental.types';

/** Estado ambiental recordado por usuario (para detectar transiciones y emitir el WS). */
interface LastEnv {
  timeOfDay?: TimeOfDay;
  condition?: WeatherCondition;
  mode?: ActivityMode;
  festivalId?: string | null;
}

/**
 * Orquestador del estado ambiental: compone `{ timeOfDay, weather, activity, festival }` a partir de
 * los servicios (hora, clima, actividad, festividad) y emite `environmental:changed` cuando cambia una
 * condición relevante. `userId` proviene siempre de la sesión (JWT), nunca del cliente (Constitución I).
 */
@Injectable()
export class EnvironmentalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly weather: WeatherService,
    private readonly activity: ActivityTrackerService,
    private readonly festival: FestivalService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private readonly lastEnv = new Map<string, LastEnv>();

  /** Compone el estado ambiental del usuario y avisa por WS de las transiciones relevantes. */
  async getStatus(userId: string): Promise<EnvironmentalStatus> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true, latitude: true, longitude: true, birthday: true },
    });

    const tz = safeTimeZone(user?.timezone ?? null);
    const now = new Date();

    const tod = timeOfDay(now, tz);
    const weather = await this.weather.getWeather(user?.latitude ?? null, user?.longitude ?? null);
    const activity = await this.activity.getStatus(userId);
    const day = calendarDayOf(now, tz);
    // v1: sin campo de región en User → solo festividades globales.
    const festival = this.festival.getActive(day, null);

    const status: EnvironmentalStatus = { timeOfDay: tod, weather, activity, festival };
    this.emitTransitions(userId, status);
    return status;
  }

  /** Registra un heartbeat y emite `environmental:changed` si se regresa de `solo` a `active`. */
  async recordActivity(userId: string, input: ActivityHeartbeatInput): Promise<{ ok: true }> {
    const { transitionedToActive } = await this.activity.recordHeartbeat(userId, input);
    if (transitionedToActive) {
      const prev = this.lastEnv.get(userId);
      if (prev && prev.mode === 'solo') {
        this.realtime.emitToUser(userId, 'environmental:changed', {
          type: 'activity',
          data: { mode: 'active' as ActivityMode },
        });
        this.lastEnv.set(userId, { ...prev, mode: 'active' });
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
  private emitTransitions(userId: string, status: EnvironmentalStatus) {
    const prev = this.lastEnv.get(userId);
    const festivalId = status.festival ? status.festival.id : null;

    if (prev) {
      if (prev.timeOfDay !== undefined && prev.timeOfDay !== status.timeOfDay) {
        this.realtime.emitToUser(userId, 'environmental:changed', {
          type: 'timeOfDay',
          data: { timeOfDay: status.timeOfDay },
        });
      }
      if (prev.condition !== undefined && prev.condition !== status.weather.condition) {
        this.realtime.emitToUser(userId, 'environmental:changed', {
          type: 'weather',
          data: {
            condition: status.weather.condition,
            temperature: status.weather.temperature,
            weatherCode: status.weather.weatherCode,
          },
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

    this.lastEnv.set(userId, {
      timeOfDay: status.timeOfDay,
      condition: status.weather.condition,
      mode: status.activity.mode,
      festivalId,
    });
  }
}
