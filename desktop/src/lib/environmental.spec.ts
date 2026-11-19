import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import {
  fetchLocalWeather,
  localWeather,
  mergeLocalWeather,
  refreshLocalWeather,
  type EnvironmentalStatus,
} from './environmental';

// Los specs corren en Node: un localStorage mínimo en memoria.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  clear: () => store.clear(),
});

const server: EnvironmentalStatus = {
  timeOfDay: 'morning',
  weather: {
    condition: 'unknown',
    temperature: null,
    weatherCode: null,
    cached: false,
    fetchedAt: null,
    sunrise: null,
    sunset: null,
  },
  activity: { active: true, mode: 'active', lastActiveAt: null },
  festival: null,
};

const openMeteo = {
  timezone: 'Europe/Madrid',
  utc_offset_seconds: 3600,
  current: { temperature_2m: 14, weather_code: 63 },
  daily: { sunrise: ['2026-11-19T08:05'], sunset: ['2026-11-19T17:52'] },
};

describe('clima del dispositivo', () => {
  beforeEach(() => {
    localStorage.clear();
    localWeather.set(null);
  });

  it('el clima local pisa siempre el del servidor', () => {
    const merged = mergeLocalWeather(server, {
      ...server.weather,
      condition: 'rain',
      temperature: 14,
      weatherCode: 63,
      timezone: 'Europe/Madrid',
      utcOffsetSeconds: 3600,
    });
    expect(merged?.timeOfDay).toBe('morning');
    expect(merged?.weather.condition).toBe('rain');
    expect(merged?.weather.timezone).toBe('Europe/Madrid');
  });

  it('sin clima local queda unknown aunque el servidor dijera otra cosa', () => {
    const merged = mergeLocalWeather({ ...server, weather: { ...server.weather, condition: 'snow' } }, null);
    expect(merged?.weather.condition).toBe('unknown');
    expect(mergeLocalWeather(null, null)).toBeNull();
  });

  it('pide a Open-Meteo con 2 decimales y lee la respuesta', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(openMeteo), { status: 200 }));
    const w = await fetchLocalWeather({ latitude: 40.416775, longitude: -3.70379 }, fetchFn as any);
    const url = new URL((fetchFn.mock.calls[0] as any[])[0] as string);
    expect(url.host).toBe('api.open-meteo.com');
    expect(url.searchParams.get('latitude')).toBe('40.42');
    expect(url.searchParams.get('longitude')).toBe('-3.7');
    expect(w?.condition).toBe('rain');
    expect(w?.sunrise).toBe('08:05');
  });

  it('un fallo de red devuelve null', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(await fetchLocalWeather({ latitude: 1, longitude: 1 }, fetchFn as any)).toBeNull();
  });

  it('fuera de Tauri (sin ubicación) se queda en unknown', async () => {
    const w = await refreshLocalWeather({ force: true });
    expect(w.condition).toBe('unknown');
    expect(get(localWeather)?.condition).toBe('unknown');
  });

  it('usa la caché si es reciente', async () => {
    localStorage.setItem(
      'pockai.localWeather.v1',
      JSON.stringify({ at: Date.now(), weather: { ...server.weather, condition: 'clear', temperature: 20 } }),
    );
    const w = await refreshLocalWeather();
    expect(w.condition).toBe('clear');
    expect(w.cached).toBe(true);
  });
});
