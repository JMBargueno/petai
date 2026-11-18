/**
 * Clima de la sala: del código WMO de Open-Meteo y la temperatura sale un `WeatherLook` numérico
 * (nubes, lluvia, nieve, niebla, tormenta), fácil de fundir entre dos estados. Funciones PURAS.
 *
 * Se parte del código WMO y no de la `condition` del backend: allí el calor y el frío extremos
 * tapan el cielo, y aquí hace falta saber si además llueve o nieva.
 */
import { mix, type SkyState } from './sunClock';

export interface WeatherLook {
  /** Cielo cubierto, de 0 (despejado) a 1. */
  cover: number;
  /** Intensidad de lluvia y de nieve, de 0 a 1. */
  rain: number;
  snow: number;
  fog: number;
  storm: boolean;
  feel: 'hot' | 'cold' | 'mild';
}

export const CLEAR: WeatherLook = { cover: 0, rain: 0, snow: 0, fog: 0, storm: false, feel: 'mild' };

const HOT_TEMP = 30;
const COLD_TEMP = 5;

/** Nubes y precipitación por código WMO: [cover, rain, snow, fog, storm]. */
const BY_CODE: Record<number, [number, number, number, number, boolean]> = {
  0: [0, 0, 0, 0, false],
  1: [0.2, 0, 0, 0, false],
  2: [0.45, 0, 0, 0, false],
  3: [0.85, 0, 0, 0, false],
  45: [0.6, 0, 0, 0.7, false],
  48: [0.6, 0, 0, 0.8, false],
  51: [0.7, 0.25, 0, 0, false],
  53: [0.75, 0.35, 0, 0, false],
  55: [0.8, 0.45, 0, 0, false],
  56: [0.75, 0.3, 0, 0, false],
  57: [0.8, 0.45, 0, 0, false],
  61: [0.8, 0.5, 0, 0, false],
  63: [0.9, 0.7, 0, 0, false],
  65: [1, 1, 0, 0, false],
  66: [0.85, 0.6, 0, 0, false],
  67: [1, 0.9, 0, 0, false],
  71: [0.8, 0, 0.4, 0, false],
  73: [0.9, 0, 0.7, 0, false],
  75: [1, 0, 1, 0, false],
  77: [0.8, 0, 0.4, 0, false],
  80: [0.75, 0.5, 0, 0, false],
  81: [0.85, 0.75, 0, 0, false],
  82: [1, 1, 0, 0, false],
  85: [0.85, 0, 0.6, 0, false],
  86: [1, 0, 1, 0, false],
  95: [1, 0.9, 0, 0, true],
  96: [1, 1, 0, 0, true],
  99: [1, 1, 0, 0, true],
};

/** Aspecto del clima. Un código desconocido o nulo se dibuja despejado. */
export function lookFromWmo(code: number | null | undefined, temperature?: number | null): WeatherLook {
  const row = typeof code === 'number' ? BY_CODE[code] : undefined;
  const [cover, rain, snow, fog, storm] = row ?? BY_CODE[0];
  const t = typeof temperature === 'number' && Number.isFinite(temperature) ? temperature : null;
  const feel = t === null ? 'mild' : t >= HOT_TEMP ? 'hot' : t <= COLD_TEMP ? 'cold' : 'mild';
  return { cover, rain, snow, fog, storm, feel };
}

/** ¿Cae algo del cielo? (el Pockai busca resguardo en las salas exteriores). */
export const isWet = (w: WeatherLook) => w.rain > 0.05 || w.snow > 0.05;

/** Avanza `from` hacia `to` una fracción `k` (fundido al cambiar de clima). */
export function blendLook(from: WeatherLook, to: WeatherLook, k: number): WeatherLook {
  const t = Math.max(0, Math.min(1, k));
  const f = (a: number, b: number) => a + (b - a) * t;
  return {
    cover: f(from.cover, to.cover),
    rain: f(from.rain, to.rain),
    snow: f(from.snow, to.snow),
    fog: f(from.fog, to.fog),
    storm: to.storm,
    feel: to.feel,
  };
}

/** El cielo con el clima encima: las nubes lo agrisan, apagan el sol y esconden las estrellas. */
export function applyWeather(sky: SkyState, w: WeatherLook): SkyState {
  const grey = mix(0x3a4156, 0xaab4c4, sky.daylight);
  const k = w.cover * 0.75;
  const skyTop = mix(sky.skyTop, grey, k);
  const skyBottom = mix(sky.skyBottom, mix(grey, 0xffffff, 0.12), k);
  return {
    ...sky,
    skyTop,
    skyBottom,
    glass: mix(skyTop, skyBottom, 0.5),
    tint: mix(sky.tint, 0x55607a, k * 0.6),
    tintAlpha: sky.tintAlpha + w.cover * 0.1 * sky.daylight + w.fog * 0.05,
    light: mix(sky.light, 0xdfe6f0, k),
    starAlpha: sky.starAlpha * (1 - w.cover),
    orbAlpha: 1 - w.cover * 0.9,
  };
}
