/**
 * Fondos por capas: modelo PURO (sin Pixi ni DOM), compartido por la escena de la aventura diaria
 * (pintor Pixi, `story/PixiLayeredBackdrop.ts`) y por los fondos animados de Arena, Raid, Torneo,
 * Entrenamiento y Cocina (pintor Canvas 2D, `canvas2d.ts`).
 *
 * Un escenario son 4 capas, una por ranura (`shared/game-data/story-locations.json`):
 *   bg → fondo lejano (deja ver el cielo vivo de detrás)
 *   l1 → plano medio: relieve o edificio
 *   l2 → suelo y atrezo, por detrás del Pockai
 *   l3 → primer plano, solo en los bordes, por delante del Pockai
 *
 * Mientras una capa no tiene imagen pintada (`shared/assets/story-layers/<id>.webp`) se dibuja una
 * silueta procedural: una lista de primitivas en coordenadas normalizadas que cualquier pintor sabe
 * trazar. Todo es determinista (sembrado por el id de la capa): mismo escenario, mismo dibujo.
 */
import catalogJson from '../../../game-data/story-locations.json';

export const SLOTS = ['bg', 'l1', 'l2', 'l3'] as const;
export type Slot = (typeof SLOTS)[number];
export type LifeKind = 'none' | 'dust' | 'firefly' | 'stardust' | 'ember';
export type Flow = 'fire' | 'water' | 'plant' | 'electric' | 'shadow' | 'light';

export interface LayerDef {
  id: string;
  slot: Slot;
  name: string;
  shape: string;
  color: string;
  /** Cuánto se desplaza con el paseo (0 quieta, 1 como el suelo, >1 primer plano). */
  parallax: number;
  /** Vaivén horizontal lento: amplitud en fracción del ancho. */
  drift: number;
  /** Balanceo vertical: amplitud en fracción del alto. */
  sway: number;
  building?: boolean;
}

export interface Composition {
  id: string;
  name: string;
  layers: Record<Slot, LayerDef>;
  /** Franja [arriba, abajo] del alto por la que anda el Pockai. */
  ground: [number, number];
  flow: Flow;
  life: LifeKind;
}

interface Catalog {
  layers: LayerDef[];
  locations: Array<{ id: string; name: string; kind: string; lore: string; layers: Record<Slot, string>; ground: [number, number]; flow: Flow; life: LifeKind }>;
  screens: Record<string, { name: string; layers: Record<Slot, string>; flow: Flow; life: LifeKind }>;
}
const catalog = catalogJson as unknown as Catalog;
const LAYERS = new Map(catalog.layers.map((l) => [l.id, l]));

function compose(id: string, name: string, set: Record<Slot, string>, ground: [number, number], flow: Flow, life: LifeKind): Composition | null {
  const layers = {} as Record<Slot, LayerDef>;
  for (const slot of SLOTS) {
    const layer = LAYERS.get(set[slot]);
    if (!layer) return null;
    layers[slot] = layer;
  }
  return { id, name, layers, ground, flow, life };
}

/** Escenario de una localización de la aventura (`null` si el id no existe). */
export function locationComposition(locationId: string): Composition | null {
  const loc = catalog.locations.find((l) => l.id === locationId);
  return loc ? compose(loc.id, loc.name, loc.layers, loc.ground, loc.flow, loc.life) : null;
}

export type ScreenId = 'arena' | 'raid' | 'tournament' | 'training' | 'kitchen';

/** Escenario de una pantalla del juego (Arena, Raid, Torneo, Entrenamiento o Cocina). */
export function screenComposition(screenId: string): Composition | null {
  const s = catalog.screens[screenId];
  return s ? compose(screenId, s.name, s.layers, [0.72, 0.9], s.flow, s.life) : null;
}

export const LOCATION_IDS: string[] = catalog.locations.map((l) => l.id);
export const SCREEN_IDS: string[] = Object.keys(catalog.screens);
export const LAYER_IDS: string[] = catalog.layers.map((l) => l.id);

// ---------- Movimiento ----------

/** Cuánto se desplaza el escenario (fracción del ancho) con una capa de parallax 1 de punta a punta. */
export const PAN = 0.1;
/** Periodo base del vaivén, en segundos (cada capa lo desfasa un poco). */
const DRIFT_PERIOD_S = 16;
const SWAY_PERIOD_S = 7;

/** Texto → entero de 32 bits (FNV-1a): semilla estable de cada capa. */
export function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Margen (fracción del lienzo) que una capa necesita por cada lado para no enseñar el borde al moverse. */
export function layerMargin(layer: LayerDef): { x: number; y: number } {
  return { x: (PAN * layer.parallax) / 2 + layer.drift + 0.005, y: layer.sway + 0.005 };
}

/**
 * Desplazamiento de una capa (fracción del ancho y del alto) en el segundo `t`.
 * `travel` es la posición de la cámara: 0 al entrar por la izquierda, 0,5 en el centro, 1 al salir.
 * Con `still` (movimiento reducido) solo cuenta la cámara, que entonces también está quieta.
 */
export function layerOffset(layer: LayerDef, t: number, travel: number, still = false): { x: number; y: number } {
  const cam = -(Math.max(0, Math.min(1, travel)) - 0.5) * PAN * layer.parallax;
  if (still) return { x: cam, y: 0 };
  const phase = (hashText(layer.id) % 1000) / 1000;
  const drift = layer.drift ? Math.sin((t / DRIFT_PERIOD_S + phase) * Math.PI * 2) * layer.drift : 0;
  const sway = layer.sway ? Math.sin((t / SWAY_PERIOD_S + phase) * Math.PI * 2) * layer.sway : 0;
  return { x: cam + drift, y: sway };
}

// ---------- Color ----------

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** Aclara (k > 0) u oscurece (k < 0) un color `#RRGGBB`; k en [-1, 1]. */
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const target = k >= 0 ? 255 : 0;
  const a = Math.abs(k);
  const ch = (v: number) => clamp255(v + (target - v) * a);
  const out = (ch((n >> 16) & 255) << 16) | (ch((n >> 8) & 255) << 8) | ch(n & 255);
  return `#${out.toString(16).padStart(6, '0')}`;
}

/** Color de acento de cada Flujo del Éter (luces, partículas, brillos). */
export const FLOW_GLOW: Record<Flow, string> = {
  fire: '#FF9A4D',
  water: '#6FD3FF',
  plant: '#9BE37A',
  electric: '#FFE066',
  shadow: '#B08CFF',
  light: '#FFF4C2',
};

// ---------- Siluetas procedurales ----------

/**
 * Primitiva de dibujo en coordenadas normalizadas de la capa: x e y en [0, 1] (0,0 arriba a la
 * izquierda). Los radios y grosores van en fracción del ALTO, para que un círculo sea un círculo.
 */
export type Prim =
  | { k: 'poly'; pts: number[]; fill: string; alpha?: number }
  | { k: 'rect'; x: number; y: number; w: number; h: number; fill: string; alpha?: number }
  | { k: 'circle'; x: number; y: number; r: number; fill: string; alpha?: number }
  | { k: 'line'; pts: number[]; stroke: string; width: number; alpha?: number };

/** Línea de relieve de lado a lado, cerrada por abajo. `rough` 0-1: cuánto sube y baja. */
function ridge(rand: () => number, yBase: number, amp: number, steps: number, rough: number): number[] {
  const pts: number[] = [0, 1];
  let y = yBase;
  for (let i = 0; i <= steps; i++) {
    y += (rand() - 0.5) * amp * rough;
    y = Math.max(yBase - amp, Math.min(yBase + amp * 0.4, y));
    pts.push(i / steps, y);
  }
  pts.push(1, 1);
  return pts;
}

/**
 * Silueta de una capa. `aspect` es ancho/alto del lienzo: los edificios se dibujan con medidas en
 * altos y se centran, así no se estiran en un lienzo apaisado (los banners de las pantallas).
 */
export function silhouette(layer: LayerDef, aspect: number): Prim[] {
  const rand = rng(hashText(layer.id));
  const c = layer.color;
  const out: Prim[] = [];
  const ax = Math.max(0.5, aspect);
  /** Ancho medido en altos → fracción del ancho. */
  const wu = (heights: number) => heights / ax;
  const dark = shade(c, -0.35);
  const lite = shade(c, 0.3);
  const glow = shade(c, 0.6);

  switch (layer.shape) {
    // ----- bg: velos que dejan ver el cielo -----
    case 'void': {
      out.push({ k: 'rect', x: 0, y: 0, w: 1, h: 1, fill: c, alpha: 0.72 });
      for (let i = 0; i < 6; i++) out.push({ k: 'circle', x: rand(), y: 0.1 + rand() * 0.5, r: 0.12 + rand() * 0.16, fill: lite, alpha: 0.06 });
      for (let i = 0; i < 40; i++) out.push({ k: 'circle', x: rand(), y: rand() * 0.7, r: 0.002 + rand() * 0.003, fill: glow, alpha: 0.35 + rand() * 0.5 });
      break;
    }
    case 'streams': {
      out.push({ k: 'rect', x: 0, y: 0, w: 1, h: 1, fill: c, alpha: 0.5 });
      for (let i = 0; i < 7; i++) {
        const y = 0.12 + i * 0.09 + rand() * 0.03;
        const pts: number[] = [];
        for (let s = 0; s <= 12; s++) pts.push(s / 12, y + Math.sin(s * 0.9 + i) * 0.025);
        out.push({ k: 'line', pts, stroke: i % 2 ? lite : glow, width: 0.004 + rand() * 0.006, alpha: 0.18 + rand() * 0.2 });
      }
      break;
    }
    case 'aurora': {
      out.push({ k: 'rect', x: 0, y: 0, w: 1, h: 1, fill: shade(c, -0.6), alpha: 0.45 });
      for (let i = 0; i < 4; i++) {
        const y0 = 0.1 + i * 0.07;
        const pts: number[] = [];
        for (let s = 0; s <= 14; s++) pts.push(s / 14, y0 + Math.sin(s * 0.7 + i * 1.3) * 0.05);
        for (let s = 14; s >= 0; s--) pts.push(s / 14, y0 + 0.16 + Math.sin(s * 0.7 + i * 1.3) * 0.05);
        out.push({ k: 'poly', pts, fill: i % 2 ? lite : c, alpha: 0.16 });
      }
      break;
    }
    case 'ridges': {
      out.push({ k: 'poly', pts: ridge(rand, 0.52, 0.16, 18, 0.9), fill: shade(c, 0.25), alpha: 0.55 });
      out.push({ k: 'poly', pts: ridge(rand, 0.6, 0.12, 22, 0.8), fill: c, alpha: 0.8 });
      break;
    }
    case 'glowline': {
      out.push({ k: 'rect', x: 0, y: 0.42, w: 1, h: 0.58, fill: shade(c, -0.5), alpha: 0.7 });
      out.push({ k: 'rect', x: 0, y: 0.4, w: 1, h: 0.1, fill: c, alpha: 0.55 });
      out.push({ k: 'rect', x: 0, y: 0.44, w: 1, h: 0.025, fill: glow, alpha: 0.5 });
      out.push({ k: 'poly', pts: ridge(rand, 0.55, 0.08, 16, 1), fill: shade(c, -0.6), alpha: 0.85 });
      break;
    }

    // ----- l1: relieve -----
    case 'hills': {
      out.push({ k: 'poly', pts: ridge(rand, 0.62, 0.1, 10, 0.7), fill: shade(c, 0.12) });
      out.push({ k: 'poly', pts: ridge(rand, 0.7, 0.07, 14, 0.6), fill: c });
      for (let i = 0; i < 9; i++) {
        const x = rand();
        out.push({ k: 'line', pts: [x, 0.7, x + (rand() - 0.5) * 0.02, 0.6 - rand() * 0.06], stroke: glow, width: 0.004, alpha: 0.5 });
      }
      break;
    }
    case 'rift': {
      out.push({ k: 'poly', pts: ridge(rand, 0.68, 0.06, 12, 0.8), fill: shade(c, -0.55) });
      // Desgarro: un rombo irregular de luz en el centro, con hebras que cuelgan de sus bordes
      const cx = 0.5;
      const hw = wu(0.16);
      out.push({ k: 'poly', pts: [cx, 0.14, cx + hw, 0.36, cx + hw * 0.5, 0.6, cx, 0.72, cx - hw * 0.6, 0.55, cx - hw, 0.33], fill: c, alpha: 0.5 });
      out.push({ k: 'poly', pts: [cx, 0.2, cx + hw * 0.55, 0.37, cx + hw * 0.25, 0.56, cx, 0.64, cx - hw * 0.3, 0.52, cx - hw * 0.55, 0.35], fill: glow, alpha: 0.75 });
      out.push({ k: 'poly', pts: [cx, 0.27, cx + hw * 0.22, 0.38, cx, 0.55, cx - hw * 0.22, 0.4], fill: '#FFFFFF', alpha: 0.8 });
      for (let i = 0; i < 10; i++) {
        const side = i % 2 ? 1 : -1;
        const x = cx + side * hw * (0.6 + rand() * 0.9);
        const y = 0.25 + rand() * 0.3;
        out.push({ k: 'line', pts: [x, y, x + side * wu(0.05), y + 0.1 + rand() * 0.14], stroke: lite, width: 0.004, alpha: 0.55 });
      }
      break;
    }
    case 'nodes': {
      out.push({ k: 'poly', pts: ridge(rand, 0.72, 0.05, 10, 0.6), fill: shade(c, -0.4) });
      for (let i = 0; i < 9; i++) {
        const x = 0.06 + rand() * 0.88;
        const y = 0.18 + rand() * 0.4;
        const r = 0.018 + rand() * 0.03;
        out.push({ k: 'circle', x, y, r: r * 2.4, fill: lite, alpha: 0.12 });
        out.push({ k: 'circle', x, y, r, fill: c });
        out.push({ k: 'circle', x, y, r: r * 0.45, fill: glow });
        out.push({ k: 'line', pts: [x, y + r, x, 0.74], stroke: lite, width: 0.003, alpha: 0.25 });
      }
      break;
    }
    case 'loom': {
      out.push({ k: 'poly', pts: ridge(rand, 0.72, 0.04, 8, 0.5), fill: shade(c, -0.45) });
      for (let i = 0; i < 4; i++) {
        const x = 0.14 + i * 0.24 + (rand() - 0.5) * 0.04;
        const w = wu(0.2);
        const top = 0.2 + rand() * 0.1;
        out.push({ k: 'rect', x: x - w / 2, y: top, w: wu(0.025), h: 0.74 - top, fill: c });
        out.push({ k: 'rect', x: x + w / 2 - wu(0.025), y: top, w: wu(0.025), h: 0.74 - top, fill: c });
        out.push({ k: 'rect', x: x - w / 2, y: top, w, h: 0.03, fill: lite });
        for (let s = 1; s < 7; s++) {
          const sx = x - w / 2 + (w * s) / 7;
          out.push({ k: 'line', pts: [sx, top + 0.03, sx, 0.72], stroke: glow, width: 0.003, alpha: 0.5 });
        }
      }
      break;
    }

    // ----- l1: edificios (medidas en altos, centrados) -----
    case 'arena': {
      const cx = 0.5;
      out.push({ k: 'poly', pts: ridge(rand, 0.74, 0.03, 8, 0.5), fill: shade(c, -0.5) });
      for (let tier = 0; tier < 4; tier++) {
        const hw = wu(0.95 - tier * 0.13);
        const y = 0.3 + tier * 0.11;
        out.push({ k: 'poly', pts: [cx - hw, y + 0.11, cx - hw * 0.94, y, cx + hw * 0.94, y, cx + hw, y + 0.11], fill: tier % 2 ? c : shade(c, 0.14) });
      }
      for (let i = 0; i < 9; i++) {
        const x = cx + wu(-0.8 + i * 0.2);
        out.push({ k: 'poly', pts: [x - wu(0.045), 0.74, x - wu(0.045), 0.6, x, 0.55, x + wu(0.045), 0.6, x + wu(0.045), 0.74], fill: dark });
      }
      for (const side of [-1, 1]) {
        const x = cx + side * wu(0.98);
        out.push({ k: 'rect', x: x - wu(0.03), y: 0.16, w: wu(0.06), h: 0.6, fill: shade(c, -0.2) });
        out.push({ k: 'circle', x, y: 0.15, r: 0.03, fill: glow });
      }
      break;
    }
    case 'towers': {
      const cx = 0.5;
      out.push({ k: 'poly', pts: ridge(rand, 0.74, 0.03, 8, 0.5), fill: shade(c, -0.55) });
      const towers = [-0.62, -0.3, 0, 0.3, 0.62];
      towers.forEach((off, i) => {
        const x = cx + wu(off);
        const hw = wu(0.07 + (i === 2 ? 0.035 : 0));
        const top = i === 2 ? 0.08 : 0.2 + rand() * 0.12;
        out.push({ k: 'poly', pts: [x - hw, 0.76, x - hw * 0.8, top + 0.08, x, top, x + hw * 0.8, top + 0.08, x + hw, 0.76], fill: i % 2 ? c : shade(c, 0.18), alpha: 0.95 });
        out.push({ k: 'poly', pts: [x - hw * 0.25, 0.76, x - hw * 0.2, top + 0.1, x, top + 0.02, x, 0.76], fill: glow, alpha: 0.35 });
      });
      for (let i = 0; i < 4; i++) {
        const a = cx + wu(towers[i]);
        const b = cx + wu(towers[i + 1]);
        out.push({ k: 'line', pts: [a, 0.34, (a + b) / 2, 0.42, b, 0.34], stroke: glow, width: 0.004, alpha: 0.6 });
      }
      break;
    }
    case 'shrine': {
      const cx = 0.5;
      out.push({ k: 'poly', pts: ridge(rand, 0.75, 0.03, 8, 0.5), fill: shade(c, -0.55) });
      // Islote flotante con un pequeño santuario encima
      out.push({ k: 'poly', pts: [cx - wu(0.5), 0.6, cx + wu(0.5), 0.6, cx + wu(0.3), 0.72, cx, 0.78, cx - wu(0.32), 0.71], fill: dark });
      out.push({ k: 'rect', x: cx - wu(0.36), y: 0.56, w: wu(0.72), h: 0.05, fill: shade(c, -0.1) });
      for (const off of [-0.26, -0.09, 0.09, 0.26]) out.push({ k: 'rect', x: cx + wu(off) - wu(0.025), y: 0.34, w: wu(0.05), h: 0.22, fill: c });
      out.push({ k: 'poly', pts: [cx - wu(0.42), 0.34, cx, 0.16, cx + wu(0.42), 0.34], fill: shade(c, 0.12) });
      out.push({ k: 'rect', x: cx - wu(0.06), y: 0.4, w: wu(0.12), h: 0.16, fill: dark });
      out.push({ k: 'circle', x: cx, y: 0.27, r: 0.022, fill: glow, alpha: 0.55 });
      break;
    }
    case 'pantry': {
      const cx = 0.5;
      out.push({ k: 'rect', x: 0, y: 0.72, w: 1, h: 0.28, fill: shade(c, -0.5) });
      out.push({ k: 'rect', x: cx - wu(0.75), y: 0.22, w: wu(1.5), h: 0.52, fill: shade(c, -0.15) });
      out.push({ k: 'poly', pts: [cx - wu(0.85), 0.24, cx, 0.08, cx + wu(0.85), 0.24], fill: c });
      for (let row = 0; row < 3; row++) {
        const y = 0.34 + row * 0.13;
        out.push({ k: 'rect', x: cx - wu(0.66), y, w: wu(1.32), h: 0.018, fill: lite });
        for (let i = 0; i < 9; i++) {
          const x = cx + wu(-0.6 + i * 0.15);
          const tall = rand() > 0.5;
          out.push({ k: 'rect', x: x - wu(0.03), y: y - (tall ? 0.07 : 0.045), w: wu(0.06), h: tall ? 0.07 : 0.045, fill: rand() > 0.5 ? glow : shade(c, 0.45), alpha: 0.85 });
        }
      }
      break;
    }
    case 'dojo': {
      const cx = 0.5;
      out.push({ k: 'rect', x: 0, y: 0.73, w: 1, h: 0.27, fill: shade(c, -0.5) });
      out.push({ k: 'rect', x: cx - wu(0.7), y: 0.32, w: wu(1.4), h: 0.42, fill: shade(c, -0.1) });
      out.push({ k: 'poly', pts: [cx - wu(0.95), 0.34, cx - wu(0.7), 0.2, cx + wu(0.7), 0.2, cx + wu(0.95), 0.34], fill: c });
      out.push({ k: 'poly', pts: [cx - wu(0.55), 0.2, cx, 0.09, cx + wu(0.55), 0.2], fill: shade(c, 0.15) });
      for (let i = 0; i < 6; i++) {
        const x = cx + wu(-0.6 + i * 0.24);
        out.push({ k: 'rect', x: x - wu(0.09), y: 0.4, w: wu(0.18), h: 0.3, fill: glow, alpha: 0.28 });
        out.push({ k: 'rect', x: x - wu(0.012), y: 0.36, w: wu(0.024), h: 0.38, fill: dark });
      }
      break;
    }

    // ----- l2: suelo -----
    case 'meadow':
    case 'plates':
    case 'runes':
    case 'shards':
    case 'planks': {
      const top = 0.74;
      out.push({ k: 'rect', x: 0, y: top, w: 1, h: 1 - top, fill: c });
      out.push({ k: 'rect', x: 0, y: top, w: 1, h: 0.018, fill: lite, alpha: 0.6 });
      if (layer.shape === 'meadow') {
        for (let i = 0; i < 70; i++) {
          const x = rand();
          const y = top + rand() * 0.02;
          out.push({ k: 'line', pts: [x, y, x + (rand() - 0.5) * 0.01, y - 0.02 - rand() * 0.03], stroke: i % 5 ? shade(c, 0.25) : glow, width: 0.004, alpha: 0.8 });
        }
      } else if (layer.shape === 'planks') {
        for (let i = 1; i < 14; i++) out.push({ k: 'line', pts: [i / 14, top + 0.02, i / 14 + (i - 7) * 0.012, 1], stroke: dark, width: 0.004, alpha: 0.6 });
        out.push({ k: 'rect', x: 0, y: top + 0.1, w: 1, h: 0.006, fill: dark, alpha: 0.5 });
      } else {
        const n = layer.shape === 'shards' ? 16 : 11;
        for (let i = 0; i < n; i++) {
          const x = rand();
          const y = top + 0.03 + rand() * 0.2;
          const w = 0.03 + rand() * 0.06;
          const h = 0.02 + rand() * 0.035;
          const skew = layer.shape === 'shards' ? (rand() - 0.5) * 0.05 : 0.012;
          out.push({ k: 'poly', pts: [x, y, x + w, y + skew * 0.3, x + w + skew, y + h, x + skew, y + h], fill: i % 3 ? shade(c, 0.16) : shade(c, -0.25), alpha: 0.9 });
          if (layer.shape === 'runes' && i % 2 === 0) out.push({ k: 'circle', x: x + w / 2, y: y + h / 2, r: 0.007, fill: glow, alpha: 0.7 });
          if (layer.shape === 'shards' && i % 4 === 0) out.push({ k: 'line', pts: [x, y, x + w + skew, y + h], stroke: glow, width: 0.003, alpha: 0.6 });
        }
      }
      break;
    }

    // ----- l3: primer plano, solo en los bordes -----
    case 'threads':
    case 'cables': {
      const n = layer.shape === 'threads' ? 9 : 5;
      for (let i = 0; i < n; i++) {
        const left = i % 2 === 0;
        const x = left ? rand() * 0.16 : 1 - rand() * 0.16;
        const len = 0.25 + rand() * 0.4;
        const bend = (left ? 1 : -1) * (0.01 + rand() * 0.03);
        out.push({ k: 'line', pts: [x, -0.02, x + bend, len * 0.5, x + bend * 0.4, len], stroke: c, width: layer.shape === 'cables' ? 0.012 : 0.006 });
        out.push({ k: 'circle', x: x + bend * 0.4, y: len, r: layer.shape === 'cables' ? 0.016 : 0.008, fill: layer.shape === 'cables' ? lite : glow, alpha: 0.9 });
      }
      break;
    }
    case 'crystals': {
      for (let i = 0; i < 8; i++) {
        const left = i % 2 === 0;
        const x = left ? rand() * 0.14 - 0.02 : 1.02 - rand() * 0.14;
        const h = 0.16 + rand() * 0.24;
        const w = wu(0.05 + rand() * 0.06);
        const lean = (left ? 1 : -1) * w * 0.5;
        out.push({ k: 'poly', pts: [x - w, 1.02, x - w * 0.4 + lean, 1 - h * 0.8, x + lean, 1 - h, x + w * 0.5 + lean, 1 - h * 0.75, x + w, 1.02], fill: c });
        out.push({ k: 'poly', pts: [x + lean, 1 - h, x + w * 0.5 + lean, 1 - h * 0.75, x + w, 1.02, x + w * 0.3, 1.02], fill: lite, alpha: 0.4 });
      }
      break;
    }
    case 'banners': {
      for (const left of [true, false]) {
        const x = left ? 0.045 : 0.955;
        const dir = left ? 1 : -1;
        out.push({ k: 'rect', x: x - wu(0.012), y: 0.06, w: wu(0.024), h: 0.96, fill: shade(c, -0.3) });
        out.push({ k: 'poly', pts: [x, 0.1, x + dir * wu(0.2), 0.12, x + dir * wu(0.17), 0.3, x + dir * wu(0.2), 0.48, x, 0.46], fill: c });
        out.push({ k: 'circle', x: x + dir * wu(0.09), y: 0.28, r: 0.03, fill: glow, alpha: 0.7 });
      }
      break;
    }
    case 'foliage': {
      for (let i = 0; i < 16; i++) {
        const left = i % 2 === 0;
        const x = left ? rand() * 0.18 - 0.04 : 1.04 - rand() * 0.18;
        const bottom = i < 8;
        const y = bottom ? 0.82 + rand() * 0.2 : rand() * 0.14 - 0.04;
        out.push({ k: 'circle', x, y, r: 0.07 + rand() * 0.07, fill: i % 3 ? c : shade(c, 0.14) });
      }
      break;
    }
    default:
      // Forma desconocida: una banda neutra, para que un catálogo nuevo no deje la capa vacía
      out.push({ k: 'rect', x: 0, y: layer.slot === 'l2' ? 0.74 : 0.6, w: 1, h: 0.4, fill: c, alpha: layer.slot === 'bg' ? 0.5 : 1 });
  }
  return out;
}

// ---------- Vida (partículas) ----------

export interface Particle {
  x: number;
  y: number;
  /** Radio base en fracción del alto. */
  r: number;
  speed: number;
  phase: number;
}

const LIFE_COUNT: Record<LifeKind, number> = { none: 0, dust: 26, firefly: 16, stardust: 34, ember: 22 };

/** Partículas de un escenario (deterministas por su id). `budget` 0-1 recorta cuántas. */
export function lifeParticles(comp: Composition, budget = 1): Particle[] {
  const rand = rng(hashText(`${comp.id}:life`));
  const n = Math.round(LIFE_COUNT[comp.life] * Math.max(0, Math.min(1, budget)));
  return Array.from({ length: n }, () => ({ x: rand(), y: rand(), r: 0.003 + rand() * 0.004, speed: 0.4 + rand() * 0.9, phase: rand() }));
}

export interface ParticleFrame {
  x: number;
  y: number;
  r: number;
  alpha: number;
}

/** Posición y brillo de una partícula en el segundo `t`. Con `still`, quieta en su sitio. */
export function particleAt(p: Particle, kind: LifeKind, t: number, still = false): ParticleFrame {
  const time = still ? 0 : t;
  const cycle = (v: number) => v - Math.floor(v);
  switch (kind) {
    case 'ember': {
      // Sube desde el suelo y se apaga
      const life = cycle(p.phase + time * 0.07 * p.speed);
      return { x: p.x + Math.sin((life + p.phase) * 9) * 0.012, y: 0.92 - life * 0.75, r: p.r * (1 - life * 0.5), alpha: Math.sin(life * Math.PI) * 0.85 };
    }
    case 'firefly': {
      const a = (p.phase + time * 0.03 * p.speed) * Math.PI * 2;
      return { x: p.x + Math.cos(a) * 0.03, y: 0.35 + p.y * 0.5 + Math.sin(a * 1.7) * 0.03, r: p.r * 1.2, alpha: 0.35 + 0.6 * Math.abs(Math.sin(a * 3)) };
    }
    case 'stardust': {
      const tw = Math.sin((p.phase + time * 0.25 * p.speed) * Math.PI * 2);
      return { x: cycle(p.x + time * 0.004 * p.speed), y: p.y * 0.8, r: p.r * 0.8, alpha: 0.3 + 0.6 * Math.max(0, tw) };
    }
    case 'dust':
      return { x: cycle(p.x + time * 0.008 * p.speed), y: 0.25 + p.y * 0.6 + Math.sin((p.phase + time * 0.05) * Math.PI * 2) * 0.02, r: p.r, alpha: 0.22 + 0.2 * Math.sin((p.phase + time * 0.1) * Math.PI * 2) ** 2 };
    default:
      return { x: p.x, y: p.y, r: 0, alpha: 0 };
  }
}
