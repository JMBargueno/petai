/**
 * Clima real a partir de la ubicación del dispositivo (Open-Meteo, gratuito y sin API key).
 * Funciones PURAS: construyen la URL y leen la respuesta; la red, el reloj y la ubicación los pone
 * cada app. Las coordenadas no pasan por nuestro servidor: la app llama a Open-Meteo directamente
 * y solo con 2 decimales (~1 km), suficiente para el clima.
 *
 * Precedencia de `condition`: un extremo de temperatura (`hot` ≥ `hotTemp`, `cold` ≤ `coldTemp`)
 * domina sobre el cielo; si no, manda el código WMO. Los umbrales viven en
 * `balance.json → environmental` (`hot_temp`, `cold_temp`).
 */

export type WeatherCondition = 'clear' | 'cloud' | 'rain' | 'snow' | 'hot' | 'cold' | 'unknown';

/** Clima tal como lo leen las escenas (misma forma que el antiguo `GET /environmental/status`). */
export interface DeviceWeather {
  condition: WeatherCondition;
  /** °C, o null si no se conoce. */
  temperature: number | null;
  /** Código WMO de Open-Meteo, o null si no se conoce. */
  weatherCode: number | null;
  /** true si se sirve desde la caché local. */
  cached: boolean;
  /** ISO 8601 del momento en que se obtuvo, o null. */
  fetchedAt: string | null;
  /** Salida y puesta de sol de hoy en la hora local del lugar ("HH:MM"), o null. */
  sunrise: string | null;
  sunset: string | null;
  /** Zona horaria IANA del lugar (p. ej. "Europe/Madrid"), o null. */
  timezone: string | null;
  /** Desfase del lugar respecto a UTC en segundos, o null: da la hora en la ubicación. */
  utcOffsetSeconds: number | null;
}

export interface WeatherThresholds {
  hotTemp: number;
  coldTemp: number;
}

export const OPEN_METEO_HOST = 'api.open-meteo.com';
export const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';

export const UNKNOWN_WEATHER: DeviceWeather = {
  condition: 'unknown',
  temperature: null,
  weatherCode: null,
  cached: false,
  fetchedAt: null,
  sunrise: null,
  sunset: null,
  timezone: null,
  utcOffsetSeconds: null,
};

/** Redondea una coordenada a 2 decimales (~1 km): no hace falta más precisión para el clima. */
export function roundCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Mapea un código WMO a una condición de cielo (sin considerar la temperatura). */
export function wmoToSkyCondition(code: number | null): WeatherCondition | null {
  if (code === null || !Number.isFinite(code)) return null;
  if (code === 0) return 'clear';
  if (code >= 1 && code <= 3) return 'cloud';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  return null;
}

/** Combina cielo y temperatura en la `condition` final. */
export function mapWeather(
  input: { weatherCode: number | null; temperature: number | null } & WeatherThresholds,
): WeatherCondition {
  const { weatherCode, temperature, hotTemp, coldTemp } = input;
  if (typeof temperature === 'number' && Number.isFinite(temperature)) {
    if (temperature >= hotTemp) return 'hot';
    if (temperature <= coldTemp) return 'cold';
  }
  return wmoToSkyCondition(weatherCode) ?? 'unknown';
}

/** Hora local "HH:MM" de un instante de Open-Meteo ("2026-11-18T07:58"); null si no tiene esa forma. */
export function clockOf(iso: unknown): string | null {
  const m = typeof iso === 'string' ? /T(\d{2}:\d{2})/.exec(iso) : null;
  return m ? m[1] : null;
}

/**
 * URL de Open-Meteo para unas coordenadas, o null si no son válidas. El host es fijo; las
 * coordenadas se redondean a 2 decimales antes de salir del dispositivo.
 */
export function buildOpenMeteoUrl(latitude: number, longitude: number): string | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const url = new URL(OPEN_METEO_BASE);
  url.searchParams.set('latitude', String(roundCoord(latitude)));
  url.searchParams.set('longitude', String(roundCoord(longitude)));
  url.searchParams.set('current', 'temperature_2m,weather_code,is_day');
  // Salida y puesta de sol de hoy, en la hora local de las coordenadas (ciclo día/noche).
  url.searchParams.set('daily', 'sunrise,sunset');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', '1');
  return url.toString();
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Lee la respuesta de Open-Meteo. Lo que falte o no tenga la forma esperada queda a null. */
export function parseOpenMeteo(data: unknown, thresholds: WeatherThresholds, fetchedAt: string): DeviceWeather {
  const d = (data ?? {}) as any;
  const temperature = num(d?.current?.temperature_2m);
  const weatherCode = num(d?.current?.weather_code);
  return {
    condition: mapWeather({ weatherCode, temperature, ...thresholds }),
    temperature,
    weatherCode,
    cached: false,
    fetchedAt,
    sunrise: clockOf(d?.daily?.sunrise?.[0]),
    sunset: clockOf(d?.daily?.sunset?.[0]),
    timezone: typeof d?.timezone === 'string' ? d.timezone : null,
    utcOffsetSeconds: num(d?.utc_offset_seconds),
  };
}
