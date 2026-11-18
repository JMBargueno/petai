/**
 * Ambiente de la sala: el cielo de fondo (degradado, sol, luna, estrellas, nubes) y el clima
 * (lluvia, nieve, niebla, rayos), dibujados por código como las carcasas de `roomStyles.ts`.
 *
 * Dos capas en coordenadas del lienzo: `back` va detrás de la sala y `front` encima. En las salas
 * interiores la lluvia solo cae fuera (detrás); en las exteriores cae también por delante.
 *
 * Modo híbrido: si la sala tiene fondo pintado (`backdrops.ts`), el paisaje va dentro de `back`
 * entre las nubes y la precipitación, con el cielo transparente para que se vea el de verdad. Se
 * ilumina con el mismo velo que la sala (`IsoRoom.drawNight`: color `tint` con `tintAlpha`), no con
 * un tinte multiplicativo: así sala y paisaje casan a cualquier hora.
 *
 * La hora sale del reloj del dispositivo (o de `clock`, para la demo) y se recalcula cada
 * `RECALC_MS`; el clima se funde en unos dos segundos. Cada vez que el cielo cambia se avisa con
 * `onSky` para que la sala ajuste su luz y sus ventanas.
 */
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { cellHash, sparkle } from '../room/roomStyles';
import { localMinute, mix, skyAt, type SkyState } from './sunClock';
import { applyWeather, blendLook, CLEAR, lookFromWmo, type WeatherLook } from './weather';

/** Lo que el anfitrión sabe del exterior (ver `setAmbience` en protocol.ts). */
export interface AmbienceState {
  weather: { code: number | null; temperature: number | null } | null;
  /** Salida y puesta de sol, en minutos del día. */
  sun: { sunrise: number; sunset: number } | null;
  /** Minuto del día forzado (demo y pruebas); `null` = reloj del dispositivo. */
  clock: number | null;
}

export const NO_AMBIENCE: AmbienceState = { weather: null, sun: null, clock: null };

interface AmbienceOptions {
  reducedMotion: boolean;
  onSky: (sky: SkyState, look: WeatherLook) => void;
  onLightning: () => void;
}

const RECALC_MS = 20_000;
const FADE_MS = 2000;
const BANDS = 10;
const STARS = 54;
const CLOUDS = 8;
const RAIN_DROPS = 170;
const SNOW_FLAKES = 80;
const STAR = 0xfff8e6;
const MOON = 0xf2f0dc;

export class Ambience {
  readonly back = new Container();
  readonly front = new Container();

  private readonly skyG = new Graphics();
  private readonly starsG = new Graphics();
  private readonly orbG = new Graphics();
  private readonly cloudsG = new Graphics();
  /** Fondo pintado: el paisaje, su silueta (máscara del velo) y el velo de la hora. */
  private readonly backdrop = new Container();
  private readonly backdropS = new Sprite();
  private readonly backdropMask = new Sprite();
  private readonly backdropVeil = new Graphics();
  private readonly backFx = new Graphics();
  private readonly frontFx = new Graphics();

  private state: AmbienceState = NO_AMBIENCE;
  private look: WeatherLook = CLEAR;
  private target: WeatherLook = CLEAR;
  /** Fundido de clima en curso: de `from` a `target` en `FADE_MS`. */
  private from: WeatherLook = CLEAR;
  private fadeStart = 0;
  private fading = false;
  private sky: SkyState = skyAt(localMinute());
  private w = 0;
  private h = 0;
  private clock = 0;
  private lastCalc = 0;
  private exterior = false;
  private edit = false;
  private flash = 0;
  private nextBolt = 6000;
  private started = false;

  constructor(private readonly opts: AmbienceOptions) {
    this.back.eventMode = 'none';
    this.front.eventMode = 'none';
    this.backdrop.addChild(this.backdropS, this.backdropMask, this.backdropVeil);
    this.backdropVeil.mask = this.backdropMask;
    this.backdrop.visible = false;
    this.back.addChild(this.skyG, this.starsG, this.orbG, this.cloudsG, this.backdrop, this.backFx);
    this.front.addChild(this.frontFx);
  }

  set(state: AmbienceState): void {
    this.state = state;
    this.target = lookFromWmo(state.weather?.code, state.weather?.temperature);
    // El primer clima se pone de golpe; los siguientes se funden (salvo con movimiento reducido).
    if (!this.started || this.opts.reducedMotion) {
      this.look = this.target;
      this.fading = false;
    } else {
      this.from = this.look;
      this.fadeStart = Date.now();
      this.fading = true;
    }
    this.started = true;
    this.recalc();
  }

  /** Sala exterior (jardín): la lluvia y la nieve caen también por delante. */
  setExterior(exterior: boolean): void {
    this.exterior = exterior;
  }

  /**
   * Fondo pintado de la sala (`null` = sin fondo, solo cielo). Recibe siempre el velo entero de
   * la hora: aunque una sala traiga su propio cielo (Cita Final), el paisaje no, y a medias se
   * vería de día bajo un cielo de noche.
   */
  setBackdrop(texture: Texture | null): void {
    const tex = texture ?? Texture.EMPTY;
    this.backdropS.texture = tex;
    this.backdropMask.texture = tex;
    this.backdrop.visible = !!texture;
    this.layoutBackdrop();
    this.drawVeil();
  }

  get hasBackdrop(): boolean {
    return this.backdrop.visible;
  }

  /** Encaje «cover» anclado abajo y al centro: el horizonte queda detrás de la sala. */
  private layoutBackdrop(): void {
    if (!this.backdrop.visible || !this.w || !this.h) return;
    const { width: tw, height: th } = this.backdropS.texture;
    if (!tw || !th) return;
    const s = Math.max(this.w / tw, this.h / th);
    for (const sp of [this.backdropS, this.backdropMask]) {
      sp.scale.set(s);
      sp.position.set((this.w - tw * s) / 2, this.h - th * s);
    }
  }

  /** Luz de la hora sobre el paisaje: el mismo velo que la sala, más una bruma de lejanía. */
  private drawVeil(): void {
    const g = this.backdropVeil;
    g.clear();
    if (!this.backdrop.visible || !this.w || !this.h) return;
    const { sky, look } = this;
    const lit = sky.tintAlpha;
    // Bruma del color del horizonte: más arriba (lejos) que abajo (cerca), y más con niebla.
    const haze = 0.1 + look.fog * 0.25 + look.cover * 0.05;
    g.rect(0, 0, this.w, this.h).fill({ color: sky.skyBottom, alpha: haze * 0.5 });
    g.rect(0, 0, this.w, this.h * 0.55).fill({ color: sky.skyBottom, alpha: haze * 0.6 });
    // Con nieve el paisaje se cubre de blanco, más en el suelo que en lo alto.
    if (look.snow > 0.05) {
      g.rect(0, this.h * 0.5, this.w, this.h * 0.5).fill({ color: 0xf4f8ff, alpha: 0.6 * look.snow });
      g.rect(0, 0, this.w, this.h).fill({ color: 0xf4f8ff, alpha: 0.3 * look.snow });
    }
    if (lit > 0.005) g.rect(0, 0, this.w, this.h).fill({ color: sky.tint, alpha: lit });
  }

  /** En modo edición no se dibuja nada por delante: estorbaría al colocar muebles. */
  setEdit(edit: boolean): void {
    this.edit = edit;
  }

  resize(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.drawSky();
    this.drawOrbs();
    this.layoutBackdrop();
    this.drawVeil();
    if (this.opts.reducedMotion) this.drawMoving();
  }

  get current(): { sky: SkyState; look: WeatherLook } {
    return { sky: this.sky, look: this.look };
  }

  update(dt: number): void {
    const now = Date.now();
    let dirty = now - this.lastCalc > RECALC_MS;
    if (this.fading) {
      // Con reloj de pared: el fundido dura lo mismo aunque el navegador frene los fotogramas.
      const k = (now - this.fadeStart) / FADE_MS;
      this.look = blendLook(this.from, this.target, k);
      this.fading = k < 1;
      dirty = true;
    }
    if (dirty) this.recalc();
    if (this.opts.reducedMotion) return;
    this.clock += dt;
    this.stepLightning(dt);
    this.drawMoving();
  }

  /** Recalcula el cielo con la hora y el clima actuales y avisa a la sala. */
  private recalc(): void {
    this.lastCalc = Date.now();
    const minute = this.state.clock ?? localMinute();
    this.sky = applyWeather(skyAt(minute, this.state.sun?.sunrise, this.state.sun?.sunset), this.look);
    this.drawSky();
    this.drawOrbs();
    this.drawVeil();
    if (this.opts.reducedMotion) this.drawMoving();
    this.opts.onSky(this.sky, this.look);
  }

  /** Unidad de tamaño: los astros y las nubes crecen con el lienzo. */
  private get unit(): number {
    return Math.max(0.6, Math.min(this.w, this.h) / 300);
  }

  private drawSky(): void {
    const g = this.skyG;
    g.clear();
    if (!this.w || !this.h) return;
    // Franjas planas en vez de un degradado continuo (GUIA_ARTISTICA §7.4: sin degradados realistas).
    const bh = this.h / BANDS;
    for (let i = 0; i < BANDS; i++) {
      g.rect(0, Math.floor(i * bh), this.w, Math.ceil(bh) + 1).fill(mix(this.sky.skyTop, this.sky.skyBottom, i / (BANDS - 1)));
    }
  }

  /** Arco de un astro por el cielo: sale por la izquierda y se pone por la derecha. */
  private arc(t: number): { x: number; y: number } {
    return { x: this.w * (0.06 + 0.88 * t), y: this.h * (0.34 - 0.26 * Math.sin(Math.PI * Math.max(0, Math.min(1, t)))) };
  }

  private drawOrbs(): void {
    const g = this.orbG;
    g.clear();
    if (!this.w || !this.h) return;
    const { sky } = this;
    const u = this.unit;
    if (sky.sunT !== null && sky.orbAlpha > 0.02) {
      const p = this.arc(sky.sunT);
      const low = 1 - Math.sin(Math.PI * Math.max(0, Math.min(1, sky.sunT)));
      const color = mix(0xfff3b0, 0xff8a4a, low);
      g.circle(p.x, p.y, 26 * u).fill({ color, alpha: 0.16 * sky.orbAlpha });
      g.circle(p.x, p.y, 19 * u).fill({ color, alpha: 0.28 * sky.orbAlpha });
      g.circle(p.x, p.y, 13 * u).fill({ color, alpha: sky.orbAlpha });
    }
    const moonAlpha = Math.max(0, 1 - sky.daylight * 1.6) * sky.orbAlpha;
    if (sky.moonT !== null && moonAlpha > 0.02) {
      const p = this.arc(sky.moonT);
      g.circle(p.x, p.y, 20 * u).fill({ color: MOON, alpha: 0.12 * moonAlpha });
      g.circle(p.x, p.y, 11 * u).fill({ color: MOON, alpha: moonAlpha });
      const crater = mix(MOON, 0x8a8ca8, 0.45);
      g.circle(p.x - 3.5 * u, p.y - 2 * u, 2.6 * u).fill({ color: crater, alpha: moonAlpha });
      g.circle(p.x + 3 * u, p.y + 3.5 * u, 1.8 * u).fill({ color: crater, alpha: moonAlpha });
      g.circle(p.x + 2 * u, p.y - 4.5 * u, 1.2 * u).fill({ color: crater, alpha: moonAlpha });
    }
  }

  /** Todo lo que se mueve: estrellas, nubes, precipitación, niebla y rayo. */
  private drawMoving(): void {
    if (!this.w || !this.h) return;
    this.drawStars();
    this.drawClouds();
    this.backFx.clear();
    this.frontFx.clear();
    this.drawPrecip(this.backFx, 1, 0);
    this.drawFog(this.backFx, 1);
    const inFront = this.exterior && !this.edit;
    if (inFront) {
      this.drawPrecip(this.frontFx, 0.6, 500);
      this.drawFog(this.frontFx, 0.55);
    }
    if (this.flash > 0.01) {
      (inFront ? this.frontFx : this.backFx).rect(0, 0, this.w, this.h).fill({ color: 0xffffff, alpha: 0.35 * this.flash });
    }
  }

  private drawStars(): void {
    const g = this.starsG;
    g.clear();
    const base = this.sky.starAlpha;
    if (base <= 0.02) return;
    const u = this.unit;
    for (let i = 0; i < STARS; i++) {
      const x = cellHash(i, 0, 61) * this.w;
      const y = cellHash(i, 1, 62) * this.h * 0.8;
      const k = cellHash(i, 2, 63);
      const tw = this.opts.reducedMotion ? 0.8 : 0.55 + 0.45 * Math.sin(this.clock / (500 + 600 * k) + k * 40);
      const a = base * tw;
      if (k > 0.85) sparkle(g, x, y, (3 + 2 * tw) * u, STAR, a);
      else g.circle(x, y, (0.7 + k) * u).fill({ color: STAR, alpha: a * 0.9 });
    }
  }

  private drawClouds(): void {
    const g = this.cloudsG;
    g.clear();
    const { cover } = this.look;
    if (cover <= 0.02) return;
    const u = this.unit;
    const { sky } = this;
    // Blancas con buen tiempo, grises si va a llover, oscuras de noche y teñidas al atardecer.
    const lit = mix(0x2a2f4a, mix(0xffffff, 0x7c8698, cover * 0.7), 0.25 + 0.75 * sky.daylight);
    const body = mix(lit, sky.skyBottom, 0.2);
    const under = mix(body, 0x1a1f33, 0.18);
    for (let i = 0; i < CLOUDS; i++) {
      const a = Math.max(0, Math.min(1, (cover * 1.25 - i / CLOUDS) * 4));
      if (a <= 0.02) continue;
      const s = (0.8 + 0.7 * cellHash(i, 0, 71)) * u;
      const cw = 60 * s;
      const span = this.w + cw * 2;
      const drift = this.clock * (0.004 + 0.006 * cellHash(i, 1, 72));
      const x = ((cellHash(i, 2, 73) * span + drift) % span) - cw;
      const y = this.h * (0.06 + 0.4 * cellHash(i, 3, 74));
      const alpha = a * 0.92;
      g.ellipse(x, y + 5 * s, 34 * s, 9 * s).fill({ color: under, alpha });
      g.ellipse(x - 16 * s, y, 18 * s, 12 * s).fill({ color: body, alpha });
      g.ellipse(x + 14 * s, y - 1 * s, 20 * s, 13 * s).fill({ color: body, alpha });
      g.ellipse(x - 1 * s, y - 8 * s, 17 * s, 13 * s).fill({ color: body, alpha });
    }
  }

  private drawPrecip(g: Graphics, density: number, salt: number): void {
    const { rain, snow } = this.look;
    const u = this.unit;
    if (rain > 0.02) {
      const n = Math.round(RAIN_DROPS * rain * density);
      const len = (9 + 7 * rain) * u;
      const fall = this.h + len;
      for (let i = 0; i < n; i++) {
        const speed = 0.45 + 0.35 * cellHash(i, 1, 81 + salt);
        const y = ((cellHash(i, 2, 82 + salt) * fall + this.clock * speed) % fall) - len;
        const x = cellHash(i, 0, 83 + salt) * (this.w + 40) - y * 0.22;
        g.moveTo(x, y).lineTo(x - len * 0.22, y + len);
      }
      g.stroke({ width: 1.4 * u, color: 0xcfe2ff, alpha: 0.7 });
    }
    if (snow > 0.02) {
      const n = Math.round(SNOW_FLAKES * snow * density);
      const fall = this.h + 8;
      for (let i = 0; i < n; i++) {
        const k = cellHash(i, 0, 91 + salt);
        const y = ((cellHash(i, 1, 92 + salt) * fall + this.clock * (0.03 + 0.04 * k)) % fall) - 4;
        const x = cellHash(i, 2, 93 + salt) * this.w + Math.sin(this.clock / (700 + 500 * k) + k * 30) * 9 * u;
        g.circle(x, y, (1.1 + 1.5 * k) * u).fill({ color: 0xffffff, alpha: 0.9 });
      }
    }
  }

  private drawFog(g: Graphics, strength: number): void {
    const { fog } = this.look;
    if (fog <= 0.02) return;
    const color = mix(0x8088a0, 0xf2f5fa, this.sky.daylight);
    for (let i = 0; i < 4; i++) {
      const rx = this.w * (0.45 + 0.25 * cellHash(i, 0, 101));
      const span = this.w + rx * 2;
      const x = ((cellHash(i, 1, 102) * span + this.clock * (0.006 + 0.004 * i)) % span) - rx;
      const y = this.h * (0.35 + 0.17 * i);
      g.ellipse(x, y, rx, this.h * 0.11).fill({ color, alpha: 0.2 * fog * strength });
    }
  }

  /** Rayos de tormenta: un destello breve cada pocos segundos. */
  private stepLightning(dt: number): void {
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt / 380);
    if (!this.look.storm) return;
    this.nextBolt -= dt;
    if (this.nextBolt > 0) return;
    this.nextBolt = 5000 + Math.random() * 8000;
    this.flash = 1;
    this.opts.onLightning();
  }

  destroy(): void {
    this.back.destroy({ children: true });
    this.front.destroy({ children: true });
  }
}
