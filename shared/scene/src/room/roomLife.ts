/**
 * Vida de la sala por encima de la carcasa: luces que se encienden al anochecer, el clima dentro
 * (gotas en los cristales, escarcha, charcos, niebla baja, nieve) y las partículas ambientales
 * (polvo, luciérnagas, mariposas, hojas, pétalos, polvo de estrellas).
 *
 * Todo se gobierna con el mismo cielo y clima que el resto de la escena (`SkyState` de
 * `sunClock.ts` con `applyWeather`, y `WeatherLook`), así una sala nunca contradice al cielo.
 *
 * Tres capas, en píxeles de la sala:
 *  - `under`: encima del suelo y las paredes, debajo de muebles y Pockai (nieve, charcos, gotas).
 *  - `mid`: encima de los muebles y debajo del velo de la noche (hojas, pétalos, mariposas, polvo).
 *  - `over`: encima del velo, en modo aditivo (luces, charcos de luz, luciérnagas, polvo de estrellas).
 *
 * Con movimiento reducido no hay partículas y lo demás se queda quieto.
 */
import { Container, Graphics } from 'pixi.js';
import { toScreen } from '../iso/projection';
import { mix, type SkyState } from '../ambience/sunClock';
import { isWet, type WeatherLook } from '../ambience/weather';
import { cellHash, openHoles, styleFor, type Glow, type Pane, type ParticleKind } from './roomStyles';

/** Luz de un mueble (`id` del mueble → dónde brilla respecto a su ancla en el suelo). */
export const FURNITURE_LIGHTS: Record<string, { dy: number; r: number; color: number }> = {
  crystal_lamp: { dy: -26, r: 40, color: 0x9fe4ff },
  stone_lantern: { dy: -20, r: 38, color: 0xffb35a },
};

const MAX: Record<ParticleKind, number> = { dust: 14, firefly: 12, butterfly: 3, leaf: 4, petal: 10, stardust: 16 };
const SPAWN_EVERY = 260;
const RAIN_COLOR = 0xcfe2ff;
const FROST = 0xeef6ff;

interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  phase: number;
  /** Altura sobre el suelo donde muere (hojas y pétalos). */
  floor: number;
  color: number;
}

export interface LifeState {
  sky: SkyState | null;
  look: WeatherLook | null;
  /** El Pockai duerme: las lámparas se quedan en lucecita de noche. */
  sleeping: boolean;
  edit: boolean;
}

/** Cuánto lucen las lámparas (0–1): al caer la noche y en días muy cubiertos. */
export function lampLevel(sky: SkyState | null, look: WeatherLook | null, sleeping: boolean): number {
  if (!sky) return 0;
  const dark = (1 - sky.daylight) * 1.25 + (look?.cover ?? 0) * 0.25 * sky.daylight;
  const k = Math.max(0, Math.min(1, dark - 0.1));
  return sleeping ? k * 0.3 : k;
}

/** ¿Qué partículas tocan ahora? (puras: se prueban sin Pixi). */
export function activeKinds(kinds: ParticleKind[], sky: SkyState | null, look: WeatherLook | null): ParticleKind[] {
  const day = sky?.daylight ?? 1;
  const wet = !!look && isWet(look);
  const cold = look?.feel === 'cold';
  const snowy = (look?.snow ?? 0) > 0.05;
  return kinds.filter((k) => {
    switch (k) {
      case 'dust':
        return day > 0.45 && (look?.cover ?? 0) < 0.7;
      case 'butterfly':
        return day > 0.6 && !wet && !cold;
      case 'firefly':
        return day < 0.35 && !wet && !cold;
      case 'leaf':
        return !snowy;
      default:
        return true;
    }
  });
}

function inPoly(pts: number[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const [xi, yi, xj, yj] = [pts[i], pts[i + 1], pts[j], pts[j + 1]];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function bbox(pts: number[]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i]);
    x1 = Math.max(x1, pts[i]);
    y0 = Math.min(y0, pts[i + 1]);
    y1 = Math.max(y1, pts[i + 1]);
  }
  return { x0, y0, x1, y1 };
}

export class RoomLife {
  readonly under = new Container();
  readonly mid = new Graphics();
  readonly over = new Graphics();
  private readonly snowG = new Graphics();
  private readonly wetG = new Graphics();

  private roomId: string | null = null;
  private W = 0;
  private H = 0;
  private floor: [number, number][] = [];
  private ponds: [number, number][] = [];
  private shellGlows: Glow[] = [];
  private furnGlows: Glow[] = [];
  private panes: Pane[] = [];
  private kinds: ParticleKind[] = [];
  private particles: Particle[] = [];
  private state: LifeState = { sky: null, look: null, sleeping: false, edit: false };
  private snowKey = -1;
  private clock = 0;
  private spawnIn = 0;
  private flash = 0;
  private seed = 1;

  constructor(private readonly reducedMotion: boolean) {
    this.under.addChild(this.snowG, this.wetG);
    this.under.eventMode = 'none';
    this.mid.eventMode = 'none';
    this.over.eventMode = 'none';
    this.over.blendMode = 'add';
  }

  setRoom(roomId: string, W: number, H: number, holes: Set<string>): void {
    const style = styleFor(roomId);
    const changed = roomId !== this.roomId || W !== this.W || H !== this.H;
    this.roomId = roomId;
    this.W = W;
    this.H = H;
    this.floor = [];
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (!holes.has(`${x},${y}`)) this.floor.push([x, y]);
    const open = openHoles(W, H, holes);
    this.ponds = [...holes].filter((k) => !open.has(k)).map((k) => k.split(',').map(Number) as [number, number]);
    this.shellGlows = style.glows?.(W, H, holes) ?? [];
    this.panes = style.panes?.(W, H) ?? [];
    this.kinds = style.life ?? [];
    if (changed) this.particles = [];
    this.snowKey = -1;
    this.drawSnow(holes);
    this.draw();
  }

  /** Luces de los muebles colocados (las calcula la sala en cada fotograma: son pocas). */
  setFurnitureGlows(glows: Glow[]): void {
    this.furnGlows = glows;
  }

  set(state: Partial<LifeState>): void {
    this.state = { ...this.state, ...state };
    if (state.look !== undefined) this.redrawSnowIfNeeded();
    if (this.state.edit) this.particles = [];
    if (this.reducedMotion) this.draw();
  }

  /** Destello de un rayo: se ve en los cristales. */
  lightning(): void {
    this.flash = 1;
  }

  private holes = new Set<string>();

  private drawSnow(holes: Set<string>): void {
    this.holes = holes;
    this.redrawSnowIfNeeded();
  }

  /** La nieve se redibuja solo al cambiar de escalón (10 niveles), no en cada fotograma. */
  private redrawSnowIfNeeded(): void {
    const amount = this.state.look?.snow ?? 0;
    const key = Math.round(amount * 10);
    if (key === this.snowKey) return;
    this.snowKey = key;
    this.snowG.clear();
    const style = styleFor(this.roomId);
    if (key > 0 && style.snow) style.snow(this.snowG, this.W, this.H, this.holes, key / 10);
  }

  update(dt: number): void {
    if (!this.roomId) return;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt / 380);
    if (this.reducedMotion) return;
    this.clock += dt;
    this.stepParticles(dt);
    this.draw();
  }

  // ───────────────────────── Partículas ─────────────────────────

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  private randomFloor(): { x: number; y: number } {
    const [cx, cy] = this.floor[Math.floor(this.rand() * this.floor.length)] ?? [0, 0];
    return toScreen(cx + this.rand(), cy + this.rand());
  }

  private spawn(kind: ParticleKind): Particle {
    const r = () => this.rand();
    const base = { kind, life: 0, phase: r() * Math.PI * 2, vx: 0, vy: 0, floor: 0, color: 0xffffff };
    switch (kind) {
      case 'dust': {
        const p = this.randomFloor();
        return { ...base, x: p.x, y: p.y - 20 - r() * 50, vx: (r() - 0.5) * 3, vy: -1 - r() * 2, max: 5000 + r() * 4000, color: 0xfff3c8 };
      }
      case 'firefly': {
        const p = this.randomFloor();
        return { ...base, x: p.x, y: p.y - 6 - r() * 34, vx: (r() - 0.5) * 8, vy: (r() - 0.5) * 6, max: 5000 + r() * 5000, color: 0xd9ff7a };
      }
      case 'butterfly': {
        const p = this.randomFloor();
        const colors = [0xffd84d, 0xff8fb1, 0x9fd8ff, 0xffffff];
        return { ...base, x: p.x, y: p.y - 18 - r() * 26, vx: (r() - 0.5) * 16, vy: (r() - 0.5) * 8, max: 9000 + r() * 6000, color: colors[Math.floor(r() * colors.length)] };
      }
      case 'leaf': {
        // De la copa del árbol del jardín (esquina del fondo) hacia el césped
        const x = -24 + r() * 52;
        const y = -122 + r() * 30;
        return { ...base, x, y, vx: 4 + r() * 6, vy: 12 + r() * 8, max: 12000, floor: y + 90 + r() * 70, color: r() < 0.5 ? 0x7cbf4a : 0xd9a441 };
      }
      case 'petal': {
        const p = this.randomFloor();
        return { ...base, x: p.x - 20, y: p.y - 90 - r() * 30, vx: 6 + r() * 6, vy: 10 + r() * 7, max: 14000, floor: p.y, color: r() < 0.6 ? 0xffc2d8 : 0xffe4ee };
      }
      case 'stardust': {
        const a = r() * Math.PI * 2;
        const p = toScreen(this.W / 2 + 2.4 * Math.cos(a), this.H / 2 + 2.4 * Math.sin(a));
        return { ...base, x: p.x, y: p.y, vx: (r() - 0.5) * 3, vy: -8 - r() * 8, max: 3500 + r() * 2500, color: r() < 0.5 ? 0xffe9a0 : 0xd6c8ff };
      }
    }
  }

  private stepParticles(dt: number): void {
    const s = dt / 1000;
    const active = this.state.edit ? [] : activeKinds(this.kinds, this.state.sky, this.state.look);
    this.particles = this.particles.filter((p) => {
      p.life += dt;
      // Lo que ya no toca (se hizo de día, empezó a llover) se apaga antes de tiempo.
      if (!active.includes(p.kind) && p.max - p.life > 800) p.max = p.life + 800;
      return p.life < p.max && !(p.floor && p.y >= p.floor);
    });
    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.floor.length) {
      this.spawnIn = SPAWN_EVERY;
      for (const kind of active) {
        const have = this.particles.reduce((n, p) => n + (p.kind === kind ? 1 : 0), 0);
        if (have < MAX[kind] && this.rand() < 0.5) this.particles.push(this.spawn(kind));
      }
    }
    for (const p of this.particles) {
      const t = (p.life + p.phase * 1000) / 1000;
      switch (p.kind) {
        case 'firefly':
        case 'butterfly':
          p.vx += (this.rand() - 0.5) * 40 * s;
          p.vy += (this.rand() - 0.5) * 30 * s;
          p.vx = Math.max(-14, Math.min(14, p.vx));
          p.vy = Math.max(-8, Math.min(8, p.vy));
          break;
        case 'leaf':
        case 'petal':
          p.vx = (p.kind === 'leaf' ? 6 : 8) + Math.sin(t * 1.6) * 14;
          break;
        case 'dust':
          p.vx += Math.sin(t) * 0.5 * s;
          break;
      }
      p.x += p.vx * s;
      p.y += p.vy * s;
    }
  }

  // ───────────────────────── Dibujo ─────────────────────────

  private draw(): void {
    this.drawWet();
    this.drawGlows();
    this.drawParticles();
  }

  /** Gotas en los cristales, escarcha, charcos, ondas en el estanque y niebla baja. */
  private drawWet(): void {
    const g = this.wetG;
    g.clear();
    const look = this.state.look;
    if (!look) return;
    const style = styleFor(this.roomId);
    const day = this.state.sky?.daylight ?? 1;
    // Escarcha en los cristales con frío o nieve
    const frost = Math.max(look.feel === 'cold' ? 0.6 : 0, look.snow);
    for (const pane of this.panes) {
      if (frost > 0.05) {
        g.poly(pane).fill({ color: FROST, alpha: 0.16 * frost });
        g.poly(pane).stroke({ width: 3, color: FROST, alpha: 0.5 * frost });
      }
      if (this.flash > 0.01) g.poly(pane).fill({ color: 0xffffff, alpha: 0.55 * this.flash });
      if (look.rain > 0.05) this.paneDrops(g, pane, look.rain);
    }
    if (!style.exterior) return;
    // Charcos con ondas en unas pocas celdas del césped
    if (look.rain > 0.05) {
      const water = mix(0x3a5a7a, 0x9fc4e0, day);
      for (const [x, y] of this.floor) {
        if (cellHash(x, y, 161) > 0.09) continue;
        const c = toScreen(x + 0.5, y + 0.5);
        g.ellipse(c.x, c.y, 11, 5).fill({ color: water, alpha: 0.35 * Math.min(1, look.rain * 1.5) });
        this.ripple(g, c.x, c.y, cellHash(x, y, 162), 11);
      }
      for (const [x, y] of this.ponds) {
        if (cellHash(x, y, 163) > 0.5) continue;
        const c = toScreen(x + 0.3 + 0.4 * cellHash(x, y, 164), y + 0.3 + 0.4 * cellHash(x, y, 165), -7);
        this.ripple(g, c.x, c.y, cellHash(x, y, 166), 9);
      }
    }
    // Niebla baja que se arrastra por el suelo
    if (look.fog > 0.05) {
      const color = mix(0x8088a0, 0xf2f5fa, day);
      const span = (this.W + this.H) * 16;
      for (let i = 0; i < 5; i++) {
        const cy = toScreen(this.W / 2, this.H / 2).y + (i - 2) * 26;
        const x = ((cellHash(i, 0, 171) * span + this.clock * (0.004 + 0.002 * i)) % span) - span / 2;
        g.ellipse(x, cy, 90, 16).fill({ color, alpha: 0.22 * look.fog });
      }
    }
  }

  private ripple(g: Graphics, x: number, y: number, phase: number, size: number): void {
    const k = ((this.clock / 1400 + phase) % 1 + 1) % 1;
    g.ellipse(x, y, size * (0.2 + k), size * 0.45 * (0.2 + k)).stroke({ width: 1, color: 0xffffff, alpha: 0.6 * (1 - k) });
  }

  private paneDrops(g: Graphics, pane: Pane, rain: number): void {
    const b = bbox(pane);
    const h = b.y1 - b.y0;
    const n = Math.round(4 + 10 * rain);
    for (let i = 0; i < n; i++) {
      const x = b.x0 + 2 + cellHash(i, pane.length, 181) * (b.x1 - b.x0 - 4);
      const speed = 0.012 + 0.02 * cellHash(i, 1, 182);
      const y = b.y0 + (((cellHash(i, 2, 183) * h + this.clock * speed) % (h + 8)) + h + 8) % (h + 8) - 4;
      if (!inPoly(pane, x, y) || !inPoly(pane, x, y + 4)) continue;
      g.moveTo(x, y).lineTo(x, y + 4);
    }
    g.stroke({ width: 1.2, color: RAIN_COLOR, alpha: 0.8 });
  }

  /** Lámparas, charcos de luz y reflejo de luna, en modo aditivo. */
  private drawGlows(): void {
    const g = this.over;
    g.clear();
    const { sky, look } = this.state;
    const lamps = lampLevel(sky, look, this.state.sleeping);
    const moon = sky && sky.moonT !== null ? sky.starAlpha : 0;
    for (const glow of [...this.shellGlows, ...this.furnGlows]) {
      const base = glow.kind === 'moon' ? moon : lamps;
      if (base <= 0.02) continue;
      const pulse = this.reducedMotion ? 1 : 1 + 0.06 * Math.sin(this.clock / 520 + glow.x * 0.1);
      const k = base * pulse;
      if (glow.pool) g.ellipse(glow.pool.x, glow.pool.y, glow.pool.rx, glow.pool.rx * 0.5).fill({ color: glow.color, alpha: 0.13 * k });
      if (glow.kind === 'moon') {
        // Reflejo alargado en el agua
        g.ellipse(glow.x, glow.y, glow.r, glow.r * 0.3).fill({ color: glow.color, alpha: 0.35 * k });
        g.ellipse(glow.x, glow.y, glow.r * 0.45, glow.r * 0.14).fill({ color: 0xffffff, alpha: 0.4 * k });
        continue;
      }
      for (const [rk, a] of [
        [1, 0.07],
        [0.62, 0.11],
        [0.32, 0.2],
      ]) {
        g.circle(glow.x, glow.y, glow.r * rk).fill({ color: glow.color, alpha: a * k });
      }
    }
  }

  private drawParticles(): void {
    const g = this.mid;
    g.clear();
    if (this.reducedMotion) return;
    const over = this.over;
    for (const p of this.particles) {
      const t = p.life / p.max;
      const fade = Math.max(0, Math.min(1, t * 5, (1 - t) * 4));
      switch (p.kind) {
        case 'dust': {
          const a = fade * (0.35 + 0.35 * Math.sin(p.life / 500 + p.phase));
          g.rect(Math.round(p.x), Math.round(p.y), 1.5, 1.5).fill({ color: p.color, alpha: Math.max(0, a) });
          break;
        }
        case 'firefly':
        case 'stardust': {
          const tw = 0.5 + 0.5 * Math.abs(Math.sin(p.life / 450 + p.phase));
          const a = fade * tw;
          over.circle(p.x, p.y, p.kind === 'firefly' ? 5 : 3.5).fill({ color: p.color, alpha: 0.18 * a });
          over.rect(Math.round(p.x - 1), Math.round(p.y - 1), 2, 2).fill({ color: p.color, alpha: a });
          break;
        }
        case 'butterfly': {
          const flap = Math.abs(Math.sin(p.life / 90 + p.phase));
          const w = 2 + 3 * flap;
          g.poly([p.x, p.y, p.x - w, p.y - 3, p.x - w * 0.8, p.y + 1]).fill({ color: p.color, alpha: fade });
          g.poly([p.x, p.y, p.x + w, p.y - 3, p.x + w * 0.8, p.y + 1]).fill({ color: p.color, alpha: fade });
          g.rect(p.x - 0.5, p.y - 2, 1, 4).fill({ color: 0x3a2a1a, alpha: fade });
          break;
        }
        case 'leaf':
        case 'petal': {
          const spin = Math.sin(p.life / 300 + p.phase);
          const w = (p.kind === 'leaf' ? 3 : 2.4) * (0.4 + 0.6 * Math.abs(spin));
          g.ellipse(p.x, p.y, w, p.kind === 'leaf' ? 1.6 : 1.3).fill({ color: p.color, alpha: fade });
          break;
        }
      }
    }
  }

  destroy(): void {
    this.under.destroy({ children: true });
    this.mid.destroy();
    this.over.destroy();
  }
}
