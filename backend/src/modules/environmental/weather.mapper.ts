/**
 * Mapeador PURO de clima: código WMO (Open-Meteo `weather_code`) + temperatura actual →
 * `WeatherCondition`. No depende de Nest ni de I/O, por lo que es testeable en aislamiento
 * (Constitución II: lógica determinista y repetible).
 *
 * Precedencia: un extremo de temperatura (`hot` ≥ `hotTemp`, `cold` ≤ `coldTemp`) domina sobre el
 * cielo, de modo que "hace 32° y despejado" se reporta como `hot` (SC / escenario US1-1). Si la
 * temperatura es nula o no extrema, se usa el código WMO.
 */
import type { WeatherCondition } from './environmental.types';

export interface WeatherMapperInput {
  /** Código WMO devuelto por Open-Meteo (`weather_code`); null si no se obtuvo. */
  weatherCode: number | null;
  /** Temperatura actual en °C (`temperature_2m`); null si no se obtuvo. */
  temperature: number | null;
  /** Umbral (°C) a partir del cual el clima se considera `hot` (balance.environmental.hot_temp). */
  hotTemp: number;
  /** Umbral (°C) a partir del cual el clima se considera `cold` (balance.environmental.cold_temp). */
  coldTemp: number;
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

/**
 * Combina cielo y temperatura en la `condition` final.
 * - temperatura ≥ hotTemp → 'hot'
 * - temperatura ≤ coldTemp → 'cold'
 * - si no, cielo por código WMO ('clear' | 'cloud' | 'rain' | 'snow')
 * - si no hay cielo conocido ni temperatura → 'unknown'
 */
export function mapWeather(input: WeatherMapperInput): WeatherCondition {
  const { weatherCode, temperature, hotTemp, coldTemp } = input;
  if (typeof temperature === 'number' && Number.isFinite(temperature)) {
    if (temperature >= hotTemp) return 'hot';
    if (temperature <= coldTemp) return 'cold';
  }
  return wmoToSkyCondition(weatherCode) ?? 'unknown';
}
