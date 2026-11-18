import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { GameDataService } from '../game-data/game-data.service';
import { mapWeather } from './weather.mapper';
import { WeatherInfo, WeatherCondition } from './environmental.types';
import { WEATHER_API_BASE, WEATHER_API_HOST, WEATHER_CACHE_TTL_SECONDS, WEATHER_TIMEOUT_MS } from './env-constants';

/** Forma serializada en Redis de la cache de clima. */
interface CachedWeather {
  temperature: number | null;
  weatherCode: number | null;
  condition: WeatherCondition;
  fetchedAt: string;
  /** Ausentes en entradas cacheadas antes de añadir el sol: se leen como null. */
  sunrise?: string | null;
  sunset?: string | null;
}

const UNKNOWN: WeatherInfo = {
  condition: 'unknown',
  temperature: null,
  weatherCode: null,
  cached: false,
  fetchedAt: null,
  sunrise: null,
  sunset: null,
};

/** Hora local "HH:MM" de un instante de Open-Meteo ("2026-11-18T07:58"); null si no tiene esa forma. */
function clockOf(iso: unknown): string | null {
  const m = typeof iso === 'string' ? /T(\d{2}:\d{2})/.exec(iso) : null;
  return m ? m[1] : null;
}

/** Completa una entrada de cache como `WeatherInfo`. */
function toInfo(w: CachedWeather, cached: boolean): WeatherInfo {
  return { ...w, sunrise: w.sunrise ?? null, sunset: w.sunset ?? null, cached };
}

/**
 * Servicio de clima: consulta Open-Meteo (gratuito, sin API key) con allowlist SSRF y timeout de
 * 3 s, cachea en Redis `weather:{lat}:{lon}` (TTL 30 min) y degrada de forma elegante ante fallo
 * (último valor cacheado o `unknown`), sin devolver nunca un `5xx` al cliente (FR-004 / SC-003).
 */
@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly gameData: GameDataService,
  ) {}

  /**
   * Devuelve el `WeatherInfo` para unas coordenadas. Sin coordenadas válidas → `unknown`
   * (degradación elegante, opt-in desactivado).
   */
  async getWeather(latitude: number | null, longitude: number | null): Promise<WeatherInfo> {
    if (latitude === null || longitude === null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return { ...UNKNOWN };
    }
    // Se redondean a 2 decimales: clave de cache estable y suficiente precisión para el clima.
    const lat = Math.round(latitude * 100) / 100;
    const lon = Math.round(longitude * 100) / 100;
    const key = this.redis.key(`weather:${lat}:${lon}`);

    // 1) Cache caliente: si está en Redis (< 30 min), se sirve sin consultar el upstream.
    const cached = await this.readCache(key);
    if (cached) return toInfo(cached, true);

    // 2) Upstream. Ante cualquier fallo se degrada (último cacheado o `unknown`).
    try {
      const fresh = await this.fetchUpstream(lat, lon);
      await this.redis.run((r) => r.set(key, JSON.stringify(fresh), 'EX', WEATHER_CACHE_TTL_SECONDS), 'weather.set');
      return toInfo(fresh, false);
    } catch (err: any) {
      this.logger.warn(`Fallo de Open-Meteo (${err?.message}); se degrada a cache o 'unknown'`);
      const retry = await this.readCache(key);
      if (retry) return toInfo(retry, true);
      return { ...UNKNOWN };
    }
  }

  /** Lee y parsea la cache; devuelve null si no existe o está corrupta. */
  private async readCache(key: string): Promise<CachedWeather | null> {
    const raw = await this.redis.run((r) => r.get(key), 'weather.get');
    if (typeof raw !== 'string') return null;
    try {
      const parsed = JSON.parse(raw) as CachedWeather;
      if (!parsed || typeof parsed.condition !== 'string') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  /** Consulta Open-Meteo con allowlist SSRF y timeout de 3 s. */
  private async fetchUpstream(lat: number, lon: number): Promise<CachedWeather> {
    const url = this.buildUrl(lat, lon);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEATHER_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as any;
      const temperature: number | null =
        typeof data?.current?.temperature_2m === 'number' ? data.current.temperature_2m : null;
      const weatherCode: number | null =
        typeof data?.current?.weather_code === 'number' ? data.current.weather_code : null;

      const env = this.gameData.getBalance()?.environmental ?? {};
      const condition = mapWeather({
        weatherCode,
        temperature,
        hotTemp: env.hot_temp ?? 30,
        coldTemp: env.cold_temp ?? 5,
      });
      return {
        temperature,
        weatherCode,
        condition,
        fetchedAt: new Date().toISOString(),
        sunrise: clockOf(data?.daily?.sunrise?.[0]),
        sunset: clockOf(data?.daily?.sunset?.[0]),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Construye la URL de Open-Meteo. Solo admite el host de la allowlist (SSRF, Constitución VIII):
   * las coordenadas se validan como números finitos y se pasan como query params; el host nunca viene
   * del cliente.
   */
  private buildUrl(lat: number, lon: number): string {
    const url = new URL(WEATHER_API_BASE);
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lon));
    url.searchParams.set('current', 'temperature_2m,weather_code,is_day');
    // Salida y puesta de sol de hoy, en la hora local de las coordenadas (ciclo día/noche de la sala).
    url.searchParams.set('daily', 'sunrise,sunset');
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', '1');
    if (url.hostname !== WEATHER_API_HOST) {
      throw new Error('Host de meteo no permitido (allowlist SSRF)');
    }
    return url.toString();
  }
}
