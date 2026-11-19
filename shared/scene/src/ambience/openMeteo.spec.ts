import { describe, expect, it } from 'vitest';
import { buildOpenMeteoUrl, clockOf, mapWeather, parseOpenMeteo, UNKNOWN_WEATHER } from './openMeteo';

const base = { hotTemp: 30, coldTemp: 5 };

describe('mapWeather', () => {
  it('cielo por código WMO', () => {
    expect(mapWeather({ weatherCode: 0, temperature: 20, ...base })).toBe('clear');
    for (const code of [1, 2, 3]) expect(mapWeather({ weatherCode: code, temperature: 18, ...base })).toBe('cloud');
    for (const code of [51, 61, 67, 80, 81, 82]) expect(mapWeather({ weatherCode: code, temperature: 15, ...base })).toBe('rain');
    for (const code of [71, 73, 77, 85, 86]) expect(mapWeather({ weatherCode: code, temperature: 8, ...base })).toBe('snow');
  });

  it('la temperatura extrema domina sobre el cielo', () => {
    expect(mapWeather({ weatherCode: 0, temperature: 32, ...base })).toBe('hot');
    expect(mapWeather({ weatherCode: 61, temperature: 30, ...base })).toBe('hot');
    expect(mapWeather({ weatherCode: 2, temperature: 5, ...base })).toBe('cold');
    expect(mapWeather({ weatherCode: 2, temperature: 22, ...base })).toBe('cloud');
  });

  it('degrada a unknown', () => {
    expect(mapWeather({ weatherCode: null, temperature: null, ...base })).toBe('unknown');
    expect(mapWeather({ weatherCode: 99, temperature: null, ...base })).toBe('unknown');
    expect(mapWeather({ weatherCode: null, temperature: 20, ...base })).toBe('unknown');
  });
});

describe('buildOpenMeteoUrl', () => {
  it('redondea a 2 decimales y usa el host fijo', () => {
    const url = new URL(buildOpenMeteoUrl(40.416775, -3.70379)!);
    expect(url.host).toBe('api.open-meteo.com');
    expect(url.searchParams.get('latitude')).toBe('40.42');
    expect(url.searchParams.get('longitude')).toBe('-3.7');
    expect(url.searchParams.get('daily')).toBe('sunrise,sunset');
    expect(url.searchParams.get('timezone')).toBe('auto');
  });

  it('rechaza coordenadas no válidas', () => {
    expect(buildOpenMeteoUrl(NaN, 0)).toBeNull();
    expect(buildOpenMeteoUrl(95, 0)).toBeNull();
    expect(buildOpenMeteoUrl(0, 200)).toBeNull();
  });
});

describe('parseOpenMeteo', () => {
  it('lee clima, sol y zona horaria', () => {
    const w = parseOpenMeteo(
      {
        timezone: 'Europe/Madrid',
        utc_offset_seconds: 3600,
        current: { temperature_2m: 12.5, weather_code: 61, is_day: 1 },
        daily: { sunrise: ['2026-11-19T08:05'], sunset: ['2026-11-19T17:52'] },
      },
      base,
      '2026-11-19T10:00:00.000Z',
    );
    expect(w).toEqual({
      condition: 'rain',
      temperature: 12.5,
      weatherCode: 61,
      cached: false,
      fetchedAt: '2026-11-19T10:00:00.000Z',
      sunrise: '08:05',
      sunset: '17:52',
      timezone: 'Europe/Madrid',
      utcOffsetSeconds: 3600,
    });
  });

  it('una respuesta vacía o rara queda en unknown', () => {
    expect(parseOpenMeteo(null, base, 'x')).toEqual({ ...UNKNOWN_WEATHER, fetchedAt: 'x' });
    expect(parseOpenMeteo({ current: { temperature_2m: 'a' } }, base, 'x').condition).toBe('unknown');
  });

  it('clockOf solo acepta instantes con hora', () => {
    expect(clockOf('2026-11-18T07:58')).toBe('07:58');
    expect(clockOf('07:58')).toBeNull();
    expect(clockOf(undefined)).toBeNull();
  });
});
