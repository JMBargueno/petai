/**
 * Modo hábitat: se oculta casi toda la interfaz (panel y dock) y en el escritorio queda solo la
 * sala del Pockai, grande, en una ventanita que se mueve y se redimensiona. Es una preferencia de
 * este equipo: se recuerda en localStorage (si está activo, qué sala se ve y, si el jugador la ha
 * movido, dónde y de qué tamaño).
 */
import { writable } from 'svelte/store';

const KEY = 'petai_habitat_mode';

export type Box = { x: number; y: number; w: number; h: number };
export type Screen = { w: number; h: number };

export interface HabitatModeState {
  on: boolean;
  /** Sala que se ve ('' = la activa). */
  roomId: string;
  /** Dónde la dejó el jugador; `null` = posición por defecto. Se encaja en pantalla al dibujarla. */
  box: Box | null;
}

export const HABITAT_MIN = { w: 360, h: 260 };
const DEFAULT_SIZE = { w: 640, h: 460 };
/** Margen con los bordes de la pantalla al colocarla por defecto. */
const EDGE = 24;

/** Encaja la ventanita en la pantalla: tamaño entre el mínimo y la pantalla, siempre visible. */
export function clampBox(box: Box, screen: Screen): Box {
  const w = Math.round(Math.max(HABITAT_MIN.w, Math.min(box.w, screen.w)));
  const h = Math.round(Math.max(HABITAT_MIN.h, Math.min(box.h, screen.h)));
  const x = Math.round(Math.max(0, Math.min(box.x, screen.w - w)));
  const y = Math.round(Math.max(0, Math.min(box.y, screen.h - h)));
  return { x, y, w, h };
}

/** Posición por defecto: abajo a la derecha, como un widget de escritorio. */
export function defaultBox(screen: Screen): Box {
  return clampBox({ x: screen.w - DEFAULT_SIZE.w - EDGE, y: screen.h - DEFAULT_SIZE.h - EDGE * 3, ...DEFAULT_SIZE }, screen);
}

/** Dónde se dibuja: la caja guardada (o la de por defecto) encajada en la pantalla actual. */
export function placeBox(box: Box | null, screen: Screen): Box {
  return box ? clampBox(box, screen) : defaultBox(screen);
}

/** Lee el estado guardado; cualquier cosa rara vuelve a los valores por defecto. */
export function parseState(raw: string | null): HabitatModeState {
  const base: HabitatModeState = { on: false, roomId: '', box: null };
  if (!raw) return base;
  try {
    const v = JSON.parse(raw);
    const ok = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
    const b = v?.box;
    const box = b && ok(b.x) && ok(b.y) && ok(b.w) && ok(b.h) ? { x: b.x, y: b.y, w: b.w, h: b.h } : null;
    return { on: v?.on === true, roomId: typeof v?.roomId === 'string' ? v.roomId : '', box };
  } catch {
    return base;
  }
}

function read(): HabitatModeState {
  try {
    return parseState(localStorage.getItem(KEY));
  } catch {
    return parseState(null);
  }
}

function createHabitatMode() {
  const store = writable<HabitatModeState>(read());
  store.subscribe((s) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* sin almacenamiento: dura lo que la sesión */
    }
  });
  return {
    subscribe: store.subscribe,
    /** Entra en el modo (opcionalmente mostrando esa sala). */
    enter(roomId?: string) {
      store.update((s) => ({ ...s, on: true, roomId: roomId ?? s.roomId }));
    },
    exit() {
      store.update((s) => ({ ...s, on: false }));
    },
    setRoom(roomId: string) {
      store.update((s) => ({ ...s, roomId }));
    },
    /** Guarda dónde la ha dejado el jugador (tras moverla o redimensionarla). */
    setBox(box: Box) {
      store.update((s) => ({ ...s, box: { ...box } }));
    },
  };
}

export const habitatMode = createHabitatMode();
