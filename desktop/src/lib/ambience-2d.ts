/**
 * Cielo y clima en Canvas 2D para las vistas de hábitat que no usan la escena de Pixi (Hábitat del
 * Nexo, escena de Visitas). Reutiliza las MISMAS funciones puras que las salas isométricas
 * (`skyAt`, `applyWeather`, `lookFromWmo`, `mix` de `@pockai/scene`), así todas las vistas
 * coinciden en la hora, la luz y el clima.
 *
 * - `outsideAt`: cielo y clima de ahora a partir del dato de Open-Meteo (o sin él: despejado y sol
 *   por defecto).
 * - `veilOf`: el velo de la hora que se pone encima del escenario (igual que el de las salas).
 * - `drawSky`: franjas de cielo, sol y luna en arco, estrellas y nubes (detrás del escenario).
 * - `Weather2D`: lluvia, nieve, niebla y rayos (delante del escenario).
 */
import {
  applyWeather,
  isWet,
  localMinute,
  lookFromWmo,
  mix,
  parseClock,
  skyAt,
  type SkyState,
  type WeatherLook,
} from '@pockai/scene';

export interface Outside {
  sky: SkyState;
  look: WeatherLook;
}

/** Lo que trae `environmentalStatus.weather` (todo opcional: sin ubicación no hay dato). */
export interface WeatherInput {
  weatherCode?: number | null;
  temperature?: number | null;
  sunrise?: string | null;
  sunset?: string | null;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const css = (c: number) => `#${(c & 0xffffff).toString(16).padStart(6, '0')}`;

/** Hash determinista en [0, 1): las estrellas y gotas no saltan entre fotogramas. */
export function hash(i: number, salt: number): number {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul((salt | 0) + 0x7f4a, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Cielo y clima en un minuto del día (por defecto, el de ahora). */
export function outsideAt(weather: WeatherInput | null | undefined, minute = localMinute()): Outside {
  const look = lookFromWmo(weather?.weatherCode ?? null, weather?.temperature ?? null);
  const sky = applyWeather(skyAt(minute, parseClock(weather?.sunrise), parseClock(weather?.sunset)), look);
  return { sky, look };
}

/** Velo de la hora sobre el escenario: el mismo color y opacidad que las salas (`IsoRoom.drawNight`). */
export function veilOf(o: Outside): { color: string; alpha: number; snow: number } {
  return { color: css(o.sky.tint), alpha: Math.round(o.sky.tintAlpha * 1000) / 1000, snow: o.look.snow };
}

/** Cuánto más reposan los residentes: de noche, con calor o mojándose van con calma (como las salas). */
export function calmOf(o: Outside): number {
  let k = 1;
  if (o.sky.daylight < 0.25) k *= 1.8;
  if (o.look.feel === 'hot') k *= 1.5;
  if (isWet(o.look)) k *= 2;
  return k;
}

/** Luciérnagas: sobre todo al atardecer y de noche, y nunca con lluvia o nieve. */
export function fireflyShare(o: Outside): number {
  if (isWet(o.look)) return 0;
  return Math.max(0.15, clamp01((1 - o.sky.daylight) * 1.3));
}

// ───────────────────────── Cielo ─────────────────────────

const BANDS = 10;
const STARS = 54;
const CLOUDS = 7;

function arc(w: number, h: number, t: number) {
  return { x: w * (0.06 + 0.88 * t), y: h * (0.34 - 0.26 * Math.sin(Math.PI * clamp01(t))) };
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, alpha: number) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Cielo de fondo (franjas planas, como en las salas: sin degradados realistas). */
export function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number, o: Outside, t: number, still = false): void {
  const { sky, look } = o;
  ctx.globalAlpha = 1;
  const bh = h / BANDS;
  for (let i = 0; i < BANDS; i++) {
    ctx.fillStyle = css(mix(sky.skyTop, sky.skyBottom, i / (BANDS - 1)));
    ctx.fillRect(0, Math.floor(i * bh), w, Math.ceil(bh) + 1);
  }
  const u = Math.max(0.6, Math.min(w, h) / 300);
  // Estrellas
  if (sky.starAlpha > 0.02) {
    for (let i = 0; i < STARS; i++) {
      const k = hash(i, 63);
      const tw = still ? 0.8 : 0.55 + 0.45 * Math.sin(t / (500 + 600 * k) + k * 40);
      circle(ctx, hash(i, 61) * w, hash(i, 62) * h * 0.6, (0.7 + k) * u, '#fff8e6', sky.starAlpha * tw * 0.9);
    }
  }
  // Sol y luna
  if (sky.sunT !== null && sky.orbAlpha > 0.02) {
    const p = arc(w, h, sky.sunT);
    const low = 1 - Math.sin(Math.PI * clamp01(sky.sunT));
    const color = css(mix(0xfff3b0, 0xff8a4a, low));
    circle(ctx, p.x, p.y, 24 * u, color, 0.16 * sky.orbAlpha);
    circle(ctx, p.x, p.y, 12 * u, color, sky.orbAlpha);
  }
  const moonAlpha = Math.max(0, 1 - sky.daylight * 1.6) * sky.orbAlpha;
  if (sky.moonT !== null && moonAlpha > 0.02) {
    const p = arc(w, h, sky.moonT);
    circle(ctx, p.x, p.y, 18 * u, '#f2f0dc', 0.12 * moonAlpha);
    circle(ctx, p.x, p.y, 10 * u, '#f2f0dc', moonAlpha);
    circle(ctx, p.x - 3 * u, p.y - 2 * u, 2.4 * u, css(mix(0xf2f0dc, 0x8a8ca8, 0.45)), moonAlpha);
  }
  // Nubes
  if (look.cover > 0.02) {
    const lit = mix(0x2a2f4a, mix(0xffffff, 0x7c8698, look.cover * 0.7), 0.25 + 0.75 * sky.daylight);
    const body = css(mix(lit, sky.skyBottom, 0.2));
    for (let i = 0; i < CLOUDS; i++) {
      const a = clamp01((look.cover * 1.25 - i / CLOUDS) * 4) * 0.9;
      if (a <= 0.02) continue;
      const s = (0.8 + 0.7 * hash(i, 71)) * u;
      const span = w + 120 * s;
      const x = ((hash(i, 73) * span + (still ? 0 : t) * (0.004 + 0.006 * hash(i, 72))) % span) - 60 * s;
      const y = h * (0.06 + 0.3 * hash(i, 74));
      ellipse(ctx, x - 16 * s, y, 18 * s, 12 * s, body, a);
      ellipse(ctx, x + 14 * s, y - s, 20 * s, 13 * s, body, a);
      ellipse(ctx, x - s, y - 8 * s, 17 * s, 13 * s, body, a);
    }
  }
  ctx.globalAlpha = 1;
}

// ───────────────────────── Clima ─────────────────────────

/** Lluvia, nieve, niebla y rayos, por delante del escenario. */
export class Weather2D {
  private flash = 0;
  private nextBolt = 6000;

  /** Avanza los rayos; devuelve `true` en el fotograma en que cae uno. */
  step(dt: number, look: WeatherLook): boolean {
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt / 380);
    if (!look.storm) return false;
    this.nextBolt -= dt;
    if (this.nextBolt > 0) return false;
    this.nextBolt = 5000 + Math.random() * 8000;
    this.flash = 1;
    return true;
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, o: Outside, t: number): void {
    const { look, sky } = o;
    const u = Math.max(0.6, Math.min(w, h) / 300);
    if (look.rain > 0.02) {
      const n = Math.round(140 * look.rain);
      const len = (9 + 7 * look.rain) * u;
      const fall = h + len;
      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = '#cfe2ff';
      ctx.lineWidth = 1.3 * u;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const y = ((hash(i, 82) * fall + t * (0.45 + 0.35 * hash(i, 81))) % fall) - len;
        const x = hash(i, 83) * (w + 40) - y * 0.22;
        ctx.moveTo(x, y);
        ctx.lineTo(x - len * 0.22, y + len);
      }
      ctx.stroke();
    }
    if (look.snow > 0.02) {
      const n = Math.round(70 * look.snow);
      const fall = h + 8;
      for (let i = 0; i < n; i++) {
        const k = hash(i, 91);
        const y = ((hash(i, 92) * fall + t * (0.03 + 0.04 * k)) % fall) - 4;
        const x = hash(i, 93) * w + Math.sin(t / (700 + 500 * k) + k * 30) * 9 * u;
        circle(ctx, x, y, (1.1 + 1.5 * k) * u, '#ffffff', 0.9);
      }
    }
    if (look.fog > 0.02) {
      const color = css(mix(0x8088a0, 0xf2f5fa, sky.daylight));
      for (let i = 0; i < 4; i++) {
        const rx = w * (0.45 + 0.25 * hash(i, 101));
        const span = w + rx * 2;
        const x = ((hash(i, 102) * span + t * (0.006 + 0.004 * i)) % span) - rx;
        ellipse(ctx, x, h * (0.4 + 0.15 * i), rx, h * 0.11, color, 0.2 * look.fog);
      }
    }
    if (this.flash > 0.01) {
      ctx.globalAlpha = 0.35 * this.flash;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalAlpha = 1;
  }
}
