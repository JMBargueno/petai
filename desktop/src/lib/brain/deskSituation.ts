/**
 * Pizarra de situación del escritorio: todo lo que el Pockai percibe en un instante, ya
 * interpretado. Se monta una vez por tic y el cerebro (`deskBrain`) decide solo con ella.
 *
 * Función pura: quien la llama aporta el reloj y las lecturas crudas.
 */
import type { Dims } from '@pockai/mind';
import type { DeskConfig } from './deskConfig';

export type Mood = 'sick' | 'hungry' | 'exhausted' | 'dirty' | 'sad' | 'happy' | 'calm';
export type CursorKind = 'none' | 'still' | 'slow' | 'moving' | 'fast';
export type Surface = 'ground' | 'wall' | 'ceiling' | 'perched' | 'air';
export type PomodoroPhase = 'idle' | 'work' | 'break';

export interface Needs {
  hunger: number;
  energy: number;
  hygiene: number;
  happiness: number;
  sick: boolean;
}

export interface ForegroundWindow {
  x: number;
  y: number;
  w: number;
  h: number;
  fullscreen: boolean;
  /** Cambia cuando la ventana en primer plano pasa a ser otra. */
  id: number;
}

/** Lecturas crudas que aporta la vista (PetView) y el sentido nativo (deskSense). */
export interface RawSituation {
  now: number;
  dims: Dims;
  pet: {
    hunger?: number | null;
    energy?: number | null;
    hygiene?: number | null;
    happiness?: number | null;
    sick?: boolean | null;
    sleeping?: boolean | null;
    element?: string | null;
  } | null;
  /** Fuera de casa o cruzando un portal. */
  away: boolean;
  /** Arrastrada o en el aire. */
  held: boolean;
  /** Reproduciendo una acción que la ocupa, o con un efecto que la bloquea. */
  busy: boolean;
  body: { x: number; y: number; size: number; dir: 1 | -1; surface: Surface; moving: boolean };
  screen: { w: number; h: number };
  cursor: { x: number; y: number; onScreen: boolean; vx: number; speed: number; stillMs: number };
  /** Inactividad del sistema en ms; `null` si la plataforma no la da. */
  idleMs: number | null;
  foreground: ForegroundWindow | null;
  appCategory: string | null;
  timeOfDay: string | null;
  pomodoro: PomodoroPhase;
  skills: Record<string, boolean>;
  reducedMotion: boolean;
  ball: { x: number; rolling: boolean } | null;
}

export interface DeskSituation {
  now: number;
  dims: Dims;
  needs: Needs;
  mood: Mood;
  sleeping: boolean;
  away: boolean;
  held: boolean;
  busy: boolean;
  body: RawSituation['body'];
  screen: { w: number; h: number };
  cursor: {
    x: number;
    y: number;
    onScreen: boolean;
    kind: CursorKind;
    speed: number;
    stillMs: number;
    /** Distancia horizontal del cursor al centro de la mascota. */
    dist: number;
    /** Distancia vertical del cursor al centro de la mascota. */
    dy: number;
    /** Se acerca deprisa a la mascota. */
    approaching: boolean;
  };
  /** Inactividad del usuario en ms (la del sistema o, si no la hay, la deducida del cursor). */
  idleMs: number;
  /** `true` si `idleMs` viene del sistema y no del cursor. */
  idleIsNative: boolean;
  userActive: boolean;
  typing: boolean;
  foreground: ForegroundWindow | null;
  appCategory: string;
  timeOfDay: string | null;
  pomodoro: PomodoroPhase;
  skills: Record<string, boolean>;
  reducedMotion: boolean;
  ball: { x: number; rolling: boolean } | null;
  element: string | null;
}

const vital = (v: number | null | undefined, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : fallback;

/** Mismo criterio que `moodOf` del servidor (`backend/src/modules/ai/personality.ts`). */
export function moodOf(n: Needs): Mood {
  if (n.sick) return 'sick';
  if (n.hunger < 25) return 'hungry';
  if (n.energy < 15) return 'exhausted';
  if (n.hygiene < 25) return 'dirty';
  if (n.happiness < 30) return 'sad';
  if (n.happiness > 75 && n.hunger > 50) return 'happy';
  return 'calm';
}

export function cursorKindOf(speed: number, stillMs: number, cfg: DeskConfig['cursor']): CursorKind {
  if (stillMs >= cfg.stillMs) return 'still';
  if (speed >= cfg.fastPxPerS) return 'fast';
  if (speed <= 0) return 'none';
  return speed <= cfg.slowPxPerS ? 'slow' : 'moving';
}

export function buildSituation(raw: RawSituation, cfg: DeskConfig): DeskSituation {
  const needs: Needs = {
    hunger: vital(raw.pet?.hunger, 60),
    energy: vital(raw.pet?.energy, 60),
    hygiene: vital(raw.pet?.hygiene, 60),
    happiness: vital(raw.pet?.happiness, 60),
    sick: !!raw.pet?.sick,
  };

  const center = raw.body.x + raw.body.size / 2;
  const dx = raw.cursor.x - center;
  const kind = raw.cursor.onScreen ? cursorKindOf(raw.cursor.speed, raw.cursor.stillMs, cfg.cursor) : 'none';
  // Se acerca si se mueve hacia el centro de la mascota con brío
  const towards = dx !== 0 && Math.sign(raw.cursor.vx) === -Math.sign(dx);
  const approaching = raw.cursor.onScreen && towards && Math.abs(raw.cursor.vx) >= cfg.cursor.slowPxPerS;

  // Sin inactividad del sistema solo se sabe cuánto lleva quieto el cursor: quien teclea sin
  // tocar el ratón parecería ausente, así que el umbral se alarga.
  const idleIsNative = raw.idleMs !== null;
  const idleMs = idleIsNative ? (raw.idleMs as number) : raw.cursor.stillMs / cfg.idle.cursorOnlyFactor;
  const typing =
    idleIsNative && (raw.idleMs as number) <= cfg.idle.typingRecentMs && raw.cursor.stillMs >= cfg.idle.typingStillMs;

  return {
    now: raw.now,
    dims: raw.dims,
    needs,
    mood: moodOf(needs),
    sleeping: !!raw.pet?.sleeping,
    away: raw.away,
    held: raw.held,
    busy: raw.busy,
    body: raw.body,
    screen: raw.screen,
    cursor: {
      x: raw.cursor.x,
      y: raw.cursor.y,
      onScreen: raw.cursor.onScreen,
      kind,
      speed: raw.cursor.speed,
      stillMs: raw.cursor.stillMs,
      dist: Math.abs(dx),
      dy: Math.abs(raw.cursor.y - (raw.body.y + raw.body.size / 2)),
      approaching,
    },
    idleMs,
    idleIsNative,
    userActive: idleMs < cfg.idle.napAfterMs / 3,
    typing,
    foreground: raw.foreground,
    appCategory: raw.appCategory || 'generic',
    timeOfDay: raw.timeOfDay,
    pomodoro: raw.pomodoro,
    skills: raw.skills,
    reducedMotion: raw.reducedMotion,
    ball: raw.ball,
    element: raw.pet?.element ?? null,
  };
}
