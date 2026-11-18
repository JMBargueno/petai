import { WeatherService } from './weather.service';
import { RedisService } from '../../redis/redis.service';
import { GameDataService } from '../game-data/game-data.service';

describe('WeatherService', () => {
  let service: WeatherService;
  let memory: Map<string, string>;

  beforeEach(() => {
    memory = new Map();
    const fakeClient = {
      get: jest.fn(async (k: string) => memory.get(k) ?? null),
      set: jest.fn(async (k: string, v: string) => {
        memory.set(k, v);
        return 'OK';
      }),
    };
    const mockRedis = {
      key: (name: string) => name,
      run: jest.fn(async (fn: (r: any) => Promise<any>) => fn(fakeClient)),
    } as unknown as RedisService;
    const mockGameData = {
      getBalance: jest.fn().mockReturnValue({ environmental: { hot_temp: 30, cold_temp: 5 } }),
    } as unknown as GameDataService;
    service = new WeatherService(mockRedis, mockGameData);
  });

  it('sin coordenadas → unknown (opt-in desactivado)', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const w = await service.getWeather(null, null);
    expect(w).toEqual({
      condition: 'unknown',
      temperature: null,
      weatherCode: null,
      cached: false,
      fetchedAt: null,
      sunrise: null,
      sunset: null,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('cache caliente → cached=true y NO consulta el upstream', async () => {
    memory.set(
      'weather:10:20',
      JSON.stringify({ condition: 'rain', temperature: 12, weatherCode: 61, fetchedAt: '2026-01-01T00:00:00.000Z' }),
    );
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const w = await service.getWeather(10, 20);
    expect(w.cached).toBe(true);
    expect(w.condition).toBe('rain');
    // Entrada cacheada antes de añadir el sol: se sirve sin él.
    expect(w.sunrise).toBeNull();
    expect(w.sunset).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('sin cache → consulta el upstream, mapea por temperatura y lo cachea', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ current: { temperature_2m: 35, weather_code: 0 } }), { status: 200 }));
    const w = await service.getWeather(10, 20);
    expect(w.cached).toBe(false);
    expect(w.condition).toBe('hot'); // 35 >= 30
    expect(w.temperature).toBe(35);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(memory.get('weather:10:20')).toBeDefined();
    fetchSpy.mockRestore();
  });

  it('pide la salida y la puesta de sol y las devuelve como hora local "HH:MM"', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          current: { temperature_2m: 14, weather_code: 2 },
          daily: { sunrise: ['2026-11-18T07:58'], sunset: ['2026-11-18T17:54'] },
        }),
        { status: 200 },
      ),
    );
    const w = await service.getWeather(10, 20);
    expect(w.sunrise).toBe('07:58');
    expect(w.sunset).toBe('17:54');
    const url = new URL(String(fetchSpy.mock.calls[0][0]));
    expect(url.searchParams.get('daily')).toBe('sunrise,sunset');
    expect(url.searchParams.get('timezone')).toBe('auto');
    // Y se cachean con el clima: la siguiente lectura los conserva.
    const again = await service.getWeather(10, 20);
    expect(again.cached).toBe(true);
    expect(again.sunset).toBe('17:54');
    fetchSpy.mockRestore();
  });

  it('upstream cae → degrada a unknown (sin 5xx interno)', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('timeout'));
    const w = await service.getWeather(10, 20);
    expect(w.condition).toBe('unknown');
    expect(w.cached).toBe(false);
    fetchSpy.mockRestore();
  });

  it('upstream devuelve 500 → degrada a unknown', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('oops', { status: 500 }));
    const w = await service.getWeather(10, 20);
    expect(w.condition).toBe('unknown');
    fetchSpy.mockRestore();
  });
});
