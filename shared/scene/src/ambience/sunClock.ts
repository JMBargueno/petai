/**
 * Reloj solar de la sala: de la hora local (minuto del día) y la salida y puesta de sol sale un
 * `SkyState` continuo (colores del cielo, luz sobre la sala, sol, luna y estrellas). Funciones
 * PURAS, sin Pixi: se prueban solas.
 *
 * El ciclo tiene seis fases ancladas al sol real: amanecer → día → tarde → atardecer → anochecer
 * → noche. Entre fotogramas clave se interpola en RGB, así que la sala cambia poco a poco.
 */

export type DayPhase = 'dawn' | 'day' | 'afternoon' | 'sunset' | 'dusk' | 'night';

export interface SkyState {
  phase: DayPhase;
  /** Degradado del cielo de fondo, de arriba abajo. */
  skyTop: number;
  skyBottom: number;
  /** Luz que cae sobre la sala (un velo de color con su opacidad). */
  tint: number;
  tintAlpha: number;
  /** Color del cristal de las ventanas. */
  glass: number;
  /** Color de la luz que entra (sol o luna). */
  light: number;
  /** 0 de noche, 1 a pleno día. */
  daylight: number;
  starAlpha: number;
  /** Recorrido del sol: 0 al salir, 1 al ponerse; `null` si está bajo el horizonte. */
  sunT: number | null;
  /** Recorrido de la luna: 0 al ponerse el sol, 1 al salir; `null` de día. */
  moonT: number | null;
  /** Cuánto se ven el sol y la luna (las nubes los tapan). */
  orbAlpha: number;
}

export const DAY_MINUTES = 1440;
/** Sin ubicación no hay sol real: se usan estas horas. */
export const DEFAULT_SUNRISE = 7 * 60 + 30;
export const DEFAULT_SUNSET = 20 * 60;

interface Key {
  top: number;
  bottom: number;
  tint: number;
  tintAlpha: number;
  light: number;
  daylight: number;
  stars: number;
}

const NIGHT: Key = { top: 0x0b1030, bottom: 0x1d2356, tint: 0x1b1846, tintAlpha: 0.42, light: 0xbfd0ff, daylight: 0, stars: 1 };
const FIRST_LIGHT: Key = { top: 0x2a2a5e, bottom: 0xc26a7a, tint: 0x4a3a78, tintAlpha: 0.28, light: 0xffc4b0, daylight: 0.2, stars: 0.35 };
const DAWN: Key = { top: 0x8fb8e8, bottom: 0xffc9a3, tint: 0xffb38a, tintAlpha: 0.12, light: 0xffe0b8, daylight: 0.65, stars: 0 };
const DAY: Key = { top: 0x6fbcff, bottom: 0xc8e8ff, tint: 0xffffff, tintAlpha: 0, light: 0xfff0be, daylight: 1, stars: 0 };
const AFTERNOON: Key = { top: 0x6aaef0, bottom: 0xffe2b0, tint: 0xffc070, tintAlpha: 0.08, light: 0xffd890, daylight: 0.95, stars: 0 };
const SUNSET: Key = { top: 0x5a5aa8, bottom: 0xff9a5c, tint: 0xff7a3c, tintAlpha: 0.18, light: 0xff9c5a, daylight: 0.6, stars: 0 };
const DUSK: Key = { top: 0x24265e, bottom: 0x8a5a9a, tint: 0x3a2f7a, tintAlpha: 0.32, light: 0xc8b8ff, daylight: 0.2, stars: 0.5 };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Mezcla dos colores 0xRRGGBB (k = 0 → a, k = 1 → b). */
export function mix(a: number, b: number, k: number): number {
  const t = clamp01(k);
  const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t));
  const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
  const bl = Math.round(lerp(a & 255, b & 255, t));
  return (r << 16) | (g << 8) | bl;
}

/** Color 0xRRGGBB → '#rrggbb' (los temas de sala van en texto). */
export const toHexString = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** "HH:MM" → minuto del día; `null` si no es una hora válida. */
export function parseClock(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 && v < DAY_MINUTES ? v : null;
  if (typeof v !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(v);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** Minuto del día (con fracción) según el reloj del dispositivo. */
export function localMinute(now = new Date()): number {
  return now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
}

/** Salida y puesta válidas (la puesta al menos 4 h después de la salida); si no, las de defecto. */
function sunTimes(sunrise: number | null | undefined, sunset: number | null | undefined): [number, number] {
  const r = parseClock(sunrise);
  const s = parseClock(sunset);
  if (r === null || s === null || s - r < 240) return [DEFAULT_SUNRISE, DEFAULT_SUNSET];
  return [r, s];
}

/** Fotogramas clave del día, en minutos crecientes. */
function keyframes(r: number, s: number): { at: number; key: Key }[] {
  const frames = [
    { at: r - 75, key: NIGHT },
    { at: r - 30, key: FIRST_LIGHT },
    { at: r + 10, key: DAWN },
    { at: r + 70, key: DAY },
    { at: s - 180, key: DAY },
    { at: s - 90, key: AFTERNOON },
    { at: s - 25, key: SUNSET },
    { at: s + 15, key: DUSK },
    { at: s + 70, key: NIGHT },
  ];
  // Días muy cortos: los tramos no pueden cruzarse.
  for (let i = 1; i < frames.length; i++) frames[i].at = Math.max(frames[i].at, frames[i - 1].at + 1);
  return frames;
}

function phaseAt(m: number, r: number, s: number): DayPhase {
  if (m < r - 75 || m >= s + 70) return 'night';
  if (m < r + 70) return 'dawn';
  if (m >= s + 5) return 'dusk';
  if (m >= s - 60) return 'sunset';
  if (m >= s - 180) return 'afternoon';
  return 'day';
}

/** Estado del cielo en un minuto del día (0–1439, admite fracción). */
export function skyAt(minute: number, sunrise?: number | null, sunset?: number | null): SkyState {
  const [r, s] = sunTimes(sunrise, sunset);
  const m = ((minute % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const frames = keyframes(r, s);

  let a = NIGHT;
  let b = NIGHT;
  let k = 0;
  for (let i = 0; i < frames.length - 1; i++) {
    if (m >= frames[i].at && m < frames[i + 1].at) {
      a = frames[i].key;
      b = frames[i + 1].key;
      k = (m - frames[i].at) / (frames[i + 1].at - frames[i].at);
      break;
    }
  }

  const skyTop = mix(a.top, b.top, k);
  const skyBottom = mix(a.bottom, b.bottom, k);
  const sunT = (m - r) / (s - r);
  // La noche cruza la medianoche: se mide desde la puesta de sol.
  const nightLen = DAY_MINUTES - (s - r);
  const sinceSunset = (m - s + DAY_MINUTES) % DAY_MINUTES;
  const moonT = sinceSunset / nightLen;

  return {
    phase: phaseAt(m, r, s),
    skyTop,
    skyBottom,
    tint: mix(a.tint, b.tint, k),
    tintAlpha: lerp(a.tintAlpha, b.tintAlpha, k),
    glass: mix(skyTop, skyBottom, 0.5),
    light: mix(a.light, b.light, k),
    daylight: lerp(a.daylight, b.daylight, k),
    starAlpha: lerp(a.stars, b.stars, k),
    sunT: sunT >= -0.06 && sunT <= 1.06 ? sunT : null,
    moonT: sunT < 0 || sunT > 1 ? moonT : null,
    orbAlpha: 1,
  };
}
