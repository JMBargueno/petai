/**
 * Hábitat del Nexo (lógica pura): niveles por XP y paseo de los residentes.
 *
 * Los niveles viven en `shared/game-data/clan-habitat.json` (el backend lee el mismo archivo).
 * El paseo es una pequeña máquina de estados por residente sobre una franja de suelo normalizada
 * (x, y ∈ [0, 1]); el componente la escala al tamaño real y la avanza en cada frame.
 */
import data from '@shared/game-data/clan-habitat.json';

export interface HabitatTierDef {
  level: number;
  id: string;
  name: string;
  minXp: number;
  tagline: string;
  /** Franja [arriba, abajo] (fracción de la altura) por la que pasean los pockais en ese fondo. */
  ground?: [number, number];
}

const DEFAULT_GROUND: [number, number] = [0.64, 0.93];

/** Franja de paseo del nivel `level` en el escenario (por defecto, el tercio inferior). */
export function groundBand(level: number): [number, number] {
  const g = HABITAT_TIERS.find((t) => t.level === level)?.ground;
  return g && g.length === 2 && g[0] < g[1] ? g : DEFAULT_GROUND;
}

export const HABITAT_TIERS: HabitatTierDef[] = [...(data.tiers as HabitatTierDef[])].sort((a, b) => a.minXp - b.minXp);
export const MAX_RESIDENTS: number = data.maxResidents;

export function habitatTier(xp: number): HabitatTierDef {
  const value = Math.max(0, Number.isFinite(xp) ? xp : 0);
  let tier = HABITAT_TIERS[0];
  for (const t of HABITAT_TIERS) if (value >= t.minXp) tier = t;
  return tier;
}

export interface TierProgress {
  tier: HabitatTierDef;
  next: HabitatTierDef | null;
  /** XP que faltan para el siguiente nivel (0 en el máximo). */
  remaining: number;
  /** 0–100 dentro del tramo actual (100 en el máximo). */
  percent: number;
}

export function tierProgress(xp: number): TierProgress {
  const value = Math.max(0, Number.isFinite(xp) ? xp : 0);
  const tier = habitatTier(value);
  const next = HABITAT_TIERS.find((t) => t.minXp > tier.minXp) ?? null;
  if (!next) return { tier, next: null, remaining: 0, percent: 100 };
  const span = next.minXp - tier.minXp;
  const percent = Math.max(0, Math.min(100, Math.floor(((value - tier.minXp) / span) * 100)));
  return { tier, next, remaining: next.minXp - value, percent };
}

// ── Paseo de los residentes ────────────────────────────────────────────────

export type WalkerMode = 'idle' | 'walk' | 'emote' | 'sleep';

export interface Walker {
  id: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  mode: WalkerMode;
  /** ms que quedan en el modo actual (idle / emote). */
  timer: number;
  /** -1 mira a la izquierda, 1 a la derecha. */
  facing: -1 | 1;
  /** Animación puntual pendiente (el componente la reproduce y la borra). */
  emote: string | null;
  /** Crece cada vez que empieza una animación puntual nueva. */
  emoteKey: number;
}

/** Franja de suelo en coordenadas normalizadas: los pockais no salen de aquí. */
export const GROUND = { minX: 0.08, maxX: 0.92, minY: 0, maxY: 1 } as const;
/** Velocidad de paseo en unidades normalizadas por segundo. */
export const WALK_SPEED = 0.06;
/** Distancia a la que dos pockais se saludan. */
export const MEET_DISTANCE = 0.09;

const IDLE_EMOTES = ['idle_alt', 'happy', 'dance'] as const;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type Rng = () => number;

/** Posición inicial repartida en la franja para que no aparezcan amontonados. */
export function spawnWalkers(ids: string[], rng: Rng = Math.random): Walker[] {
  const n = ids.length;
  return ids.map((id, i) => {
    const slot = n <= 1 ? 0.5 : i / (n - 1);
    const x = clamp(GROUND.minX + slot * (GROUND.maxX - GROUND.minX) + (rng() - 0.5) * 0.06, GROUND.minX, GROUND.maxX);
    const y = clamp(rng(), GROUND.minY, GROUND.maxY);
    return { id, x, y, tx: x, ty: y, mode: 'idle', timer: 400 + rng() * 2400, facing: rng() < 0.5 ? -1 : 1, emote: null, emoteKey: 0 };
  });
}

function pickTarget(w: Walker, rng: Rng): Walker {
  // Paseos cortos: como mucho un tercio del escenario de una vez.
  const tx = clamp(w.x + (rng() - 0.5) * 0.66, GROUND.minX, GROUND.maxX);
  const ty = clamp(w.y + (rng() - 0.5) * 0.8, GROUND.minY, GROUND.maxY);
  return { ...w, tx, ty, mode: 'walk', facing: tx >= w.x ? 1 : -1 };
}

/**
 * Avanza `dt` ms a todos los residentes. `sleeping` marca a los que su dueño tiene dormidos: no se
 * mueven. Cuando dos se cruzan, se paran y se saludan (`love` o `happy`).
 */
export function stepWalkers(walkers: Walker[], dt: number, sleeping: Set<string> = new Set(), rng: Rng = Math.random): Walker[] {
  const step = Math.max(0, Math.min(dt, 250));
  let next = walkers.map((w): Walker => {
    if (sleeping.has(w.id)) return { ...w, mode: 'sleep', tx: w.x, ty: w.y };
    if (w.mode === 'sleep') return { ...w, mode: 'idle', timer: 600 };

    if (w.mode === 'walk') {
      const dx = w.tx - w.x;
      const dy = (w.ty - w.y) * 0.5; // la profundidad se recorre más despacio
      const dist = Math.hypot(dx, dy);
      const move = (WALK_SPEED * step) / 1000;
      if (dist <= move) {
        const rest: Walker = { ...w, x: w.tx, y: w.ty, mode: 'idle', timer: 1500 + rng() * 3500 };
        // A veces, al llegar, hace algo de ilusión.
        return rng() < 0.35 ? { ...rest, mode: 'emote', timer: 1600, emote: IDLE_EMOTES[Math.floor(rng() * IDLE_EMOTES.length)], emoteKey: w.emoteKey + 1 } : rest;
      }
      const k = move / dist;
      return { ...w, x: clamp(w.x + dx * k, GROUND.minX, GROUND.maxX), y: clamp(w.y + dy * 2 * k, GROUND.minY, GROUND.maxY) };
    }

    const timer = w.timer - step;
    if (timer > 0) return { ...w, timer };
    return pickTarget({ ...w, timer: 0, emote: null }, rng);
  });

  // Encuentros: dos que caminan y quedan cerca se paran y se saludan mirándose.
  for (let i = 0; i < next.length; i++) {
    for (let j = i + 1; j < next.length; j++) {
      const a = next[i];
      const b = next[j];
      if (a.mode !== 'walk' || b.mode !== 'walk') continue;
      if (Math.hypot(a.x - b.x, (a.y - b.y) * 0.4) > MEET_DISTANCE) continue;
      const emote = rng() < 0.5 ? 'love' : 'happy';
      next = next.slice();
      next[i] = { ...a, mode: 'emote', timer: 1800, emote, emoteKey: a.emoteKey + 1, facing: b.x >= a.x ? 1 : -1, tx: a.x, ty: a.y };
      next[j] = { ...b, mode: 'emote', timer: 1800, emote, emoteKey: b.emoteKey + 1, facing: a.x >= b.x ? 1 : -1, tx: b.x, ty: b.y };
    }
  }
  return next;
}

/** Todos celebran a la vez (XP del clan, juramento cumplido o subida de nivel). */
export function celebrateAll(walkers: Walker[], emote: string, duration = 2000): Walker[] {
  return walkers.map((w) => (w.mode === 'sleep' ? w : { ...w, mode: 'emote', timer: duration, emote, emoteKey: w.emoteKey + 1, tx: w.x, ty: w.y }));
}

/** Escala por profundidad: los del fondo (y=0) se ven más pequeños que los de delante (y=1). */
export function depthScale(y: number): number {
  return 0.72 + clamp(y, 0, 1) * 0.28;
}
