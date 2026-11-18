/**
 * Sentidos del escritorio: lo que el Pockai percibe del equipo (cursor, inactividad del sistema
 * y ventana en primer plano). Une lo que llega del lado nativo (`src-tauri/src/desk_sense.rs`)
 * con el ratón del propio webview, que es lo único disponible en el navegador y en la demo.
 *
 * Nada de esto sale del equipo: se usa para decidir conductas y no entra en `deskContext` ni en
 * el resumen de hábitos.
 */
import type { ForegroundWindow, RawSituation } from './deskSituation';

export interface CursorTrack {
  x: number;
  y: number;
  /** Velocidad horizontal suavizada, en px/s (con signo). */
  vx: number;
  /** Rapidez suavizada, en px/s. */
  speed: number;
  /** Último momento en que se movió de verdad. */
  lastMoveAt: number;
  lastSampleAt: number;
  /** `false` hasta que llega la primera muestra. */
  seen: boolean;
}

export function newCursorTrack(now: number): CursorTrack {
  return { x: 0, y: 0, vx: 0, speed: 0, lastMoveAt: now, lastSampleAt: now, seen: false };
}

/** Por debajo de esto no cuenta como movimiento (temblor del ratón). */
const MOVE_EPS = 1.5;
/** Sin muestras durante este tiempo, el cursor se da por parado. */
const STALE_MS = 220;

/** Incorpora una muestra de posición. Función pura. */
export function trackCursor(prev: CursorTrack, x: number, y: number, now: number): CursorTrack {
  if (!prev.seen) return { x, y, vx: 0, speed: 0, lastMoveAt: now, lastSampleAt: now, seen: true };
  const dt = now - prev.lastSampleAt;
  const dx = x - prev.x;
  const dy = y - prev.y;
  const moved = Math.hypot(dx, dy) >= MOVE_EPS;
  if (dt <= 0) return moved ? { ...prev, x, y, lastMoveAt: now } : prev;
  // Tras una pausa la velocidad anterior ya no dice nada: se parte de la instantánea
  const fresh = dt > STALE_MS;
  const k = fresh ? 1 : 0.5;
  const ivx = (dx / dt) * 1000;
  const ispeed = (Math.hypot(dx, dy) / dt) * 1000;
  return {
    x,
    y,
    vx: prev.vx + (ivx - prev.vx) * k,
    speed: prev.speed + (ispeed - prev.speed) * k,
    lastMoveAt: moved ? now : prev.lastMoveAt,
    lastSampleAt: now,
    seen: true,
  };
}

/** Lectura del cursor para la pizarra. Función pura. */
export function readCursor(track: CursorTrack, now: number, screen: { w: number; h: number }): RawSituation['cursor'] {
  const stale = now - track.lastSampleAt > STALE_MS;
  return {
    x: track.x,
    y: track.y,
    onScreen: track.seen && track.x >= 0 && track.y >= 0 && track.x <= screen.w && track.y <= screen.h,
    vx: stale ? 0 : track.vx,
    speed: stale ? 0 : track.speed,
    stillMs: Math.max(0, now - track.lastMoveAt),
  };
}

export interface SenseWants {
  cursor: boolean;
  idle: boolean;
  foreground: boolean;
  /** Muestreo rápido de la ventana (mientras está posada en ella). */
  fast: boolean;
}

export interface SenseOverrides {
  idleMs?: number | null;
  foreground?: ForegroundWindow | null;
  appCategory?: string | null;
  timeOfDay?: string | null;
  cursor?: { x: number; y: number };
}

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * Receptor de sentidos. Una instancia por mascota en pantalla; `stop()` suelta los oyentes y
 * apaga los sentidos nativos.
 */
export class DeskSense {
  private track = newCursorTrack(performance.now());
  private idle: { ms: number; at: number } | null = null;
  private foreground: ForegroundWindow | null = null;
  private wants: SenseWants = { cursor: false, idle: false, foreground: false, fast: false };
  private unlisten: (() => void)[] = [];
  private stopped = false;
  /** Valores forzados desde la consola en desarrollo (`window.__pockaiSense.set`). */
  overrides: SenseOverrides = {};

  start() {
    if (typeof window === 'undefined') return;
    const onMove = (e: MouseEvent) => this.feedCursor(e.clientX, e.clientY);
    window.addEventListener('mousemove', onMove);
    this.unlisten.push(() => window.removeEventListener('mousemove', onMove));

    if (isTauri()) {
      import('@tauri-apps/api/event')
        .then(async ({ listen }) => {
          const stops = await Promise.all([
            listen<{ x: number; y: number }>('desk:cursor', (e) => this.feedCursor(e.payload.x, e.payload.y)),
            listen<{ idleMs: number | null; foreground: ForegroundWindow | null }>('desk:sense', (e) => {
              this.idle = e.payload.idleMs === null ? null : { ms: e.payload.idleMs, at: performance.now() };
              this.foreground = e.payload.foreground;
            }),
          ]);
          if (this.stopped) stops.forEach((fn) => fn());
          else this.unlisten.push(...stops);
        })
        .catch(() => {});
    }

    if (import.meta.env?.DEV) {
      (window as any).__pockaiSense = {
        set: (o: SenseOverrides) => {
          this.overrides = { ...this.overrides, ...o };
          if (o.cursor) this.feedCursor(o.cursor.x, o.cursor.y);
        },
        clear: () => (this.overrides = {}),
        get: () => ({ overrides: this.overrides, wants: this.wants, foreground: this.foreground, idle: this.idle }),
      };
    }
  }

  stop() {
    this.stopped = true;
    this.unlisten.forEach((fn) => fn());
    this.unlisten = [];
    this.want({ cursor: false, idle: false, foreground: false, fast: false });
    if (typeof window !== 'undefined' && import.meta.env?.DEV) delete (window as any).__pockaiSense;
  }

  feedCursor(x: number, y: number) {
    this.track = trackCursor(this.track, x, y, performance.now());
  }

  /** Enciende o apaga los sentidos nativos según lo que necesiten las habilidades activas. */
  want(next: SenseWants) {
    const w = this.wants;
    if (w.cursor === next.cursor && w.idle === next.idle && w.foreground === next.foreground && w.fast === next.fast) return;
    this.wants = next;
    if (!next.idle) this.idle = null;
    if (!next.foreground) this.foreground = null;
    if (!isTauri()) return;
    import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke('set_desk_sense', { request: next }))
      .catch(() => {});
  }

  cursor(now: number, screen: { w: number; h: number }): RawSituation['cursor'] {
    return readCursor(this.track, now, screen);
  }

  /** Inactividad del sistema en ms, extrapolada desde la última lectura; `null` si no la hay. */
  idleMs(now: number): number | null {
    if (this.overrides.idleMs !== undefined) return this.overrides.idleMs;
    if (!this.idle) return null;
    return this.idle.ms + Math.max(0, now - this.idle.at);
  }

  foregroundWindow(): ForegroundWindow | null {
    if (this.overrides.foreground !== undefined) return this.overrides.foreground;
    return this.foreground;
  }
}
