import { get } from 'svelte/store';
import { deskState } from './deskContext';
import { pomodoroStore } from './pomodoro';
import type { AppCategory } from './contextAwareness';

/**
 * Hábitos de escritorio: contadores locales que se envían resumidos al servidor como mucho una
 * vez al día. El servidor los fusiona en un perfil de tamaño fijo y deriva frases de hábito que
 * se sincronizan con el resto de dispositivos.
 *
 * Privacidad: solo minutos por categoría de app y franja de 4 h, y duraciones de Pomodoro.
 * Nunca títulos de ventana. La categoría solo existe si «Conciencia de la app en foco» está activa
 * (y el servidor lo vuelve a comprobar).
 */

const STORAGE_KEY = 'petai:context_digest:v1';
const CATEGORIES = ['coding', 'music', 'video', 'gaming', 'reading'] as const;
type Cat = (typeof CATEGORIES)[number];
export const SLOTS = 6;
/** Intervalo mínimo entre envíos (el servidor admite uno cada 12 h). */
export const SEND_EVERY_MS = 20 * 3600 * 1000;
const MAX_SLOT_MINUTES = 240;
const MAX_TOTAL_MINUTES = 2400; // por debajo del máximo del servidor (2 días)
const MAX_POMODOROS = 30;

export interface DigestState {
  appMinutes: Partial<Record<Cat, number[]>>;
  pomodoros: number[];
  lastSentAt: number;
}

export function emptyState(now = Date.now()): DigestState {
  return { appMinutes: {}, pomodoros: [], lastSentAt: now };
}

export function loadState(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): DigestState {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && typeof s === 'object' && typeof s.lastSentAt === 'number') {
        return { appMinutes: s.appMinutes ?? {}, pomodoros: Array.isArray(s.pomodoros) ? s.pomodoros : [], lastSentAt: s.lastSentAt };
      }
    }
  } catch {
    /* estado corrupto: se empieza de cero */
  }
  return emptyState();
}

function saveState(s: DigestState) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* sin almacenamiento: se pierde el contador, no es grave */
  }
}

export const slotOf = (d: Date) => Math.min(SLOTS - 1, Math.floor(d.getHours() / 4));

/** Suma un minuto a la categoría y franja actuales (solo categorías conocidas). */
export function addMinute(s: DigestState, category: AppCategory | null, at: Date): DigestState {
  if (!category || !(CATEGORIES as readonly string[]).includes(category)) return s;
  const cat = category as Cat;
  const row = s.appMinutes[cat] ?? Array(SLOTS).fill(0);
  const slot = slotOf(at);
  row[slot] = Math.min(MAX_SLOT_MINUTES, row[slot] + 1);
  return { ...s, appMinutes: { ...s.appMinutes, [cat]: row } };
}

export function addPomodoro(s: DigestState, workMinutes: number): DigestState {
  if (!(workMinutes >= 1 && workMinutes <= 180)) return s;
  return { ...s, pomodoros: [...s.pomodoros, Math.round(workMinutes)].slice(-MAX_POMODOROS) };
}

/** Cuerpo que se envía al servidor, siempre dentro de sus límites. Null si no hay nada. */
export function buildDigest(s: DigestState): { appMinutes?: Partial<Record<Cat, number[]>>; pomodoros?: number[] } | null {
  const out: { appMinutes?: Partial<Record<Cat, number[]>>; pomodoros?: number[] } = {};
  const rows = Object.entries(s.appMinutes).filter(([, r]) => Array.isArray(r) && r.length === SLOTS) as [Cat, number[]][];
  const total = rows.reduce((a, [, r]) => a + r.reduce((x, y) => x + y, 0), 0);
  if (total > 0) {
    // Si hubo varios días sin enviar, se escala para no superar el máximo (se conserva la proporción)
    const k = total > MAX_TOTAL_MINUTES ? MAX_TOTAL_MINUTES / total : 1;
    out.appMinutes = Object.fromEntries(rows.map(([c, r]) => [c, r.map((v) => Math.floor(Math.min(MAX_SLOT_MINUTES, v) * k))]));
  }
  if (s.pomodoros.length) out.pomodoros = s.pomodoros.slice(-MAX_POMODOROS);
  return out.appMinutes || out.pomodoros ? out : null;
}

/**
 * Arranca el contador (un minuto cada 60 s) y el envío diario. Devuelve la función de parada.
 * `send` debe lanzar con `status` 429 si el servidor ya recibió uno hace poco.
 */
export function startContextDigest(getPetId: () => string | null, send: (petId: string, body: unknown) => Promise<unknown>): () => void {
  let state = loadState();
  let sending = false;

  const onPomodoro = (e: Event) => {
    if ((e as CustomEvent).detail?.eventType !== 'work_finish') return;
    state = addPomodoro(state, get(pomodoroStore).workDuration / 60);
    saveState(state);
  };
  window.addEventListener('petai:pomodoro_event', onPomodoro);

  const tick = async () => {
    state = addMinute(state, get(deskState).appCategory, new Date());
    saveState(state);
    const petId = getPetId();
    if (!petId || sending || Date.now() - state.lastSentAt < SEND_EVERY_MS) return;
    const body = buildDigest(state);
    if (!body) {
      state = { ...state, lastSentAt: Date.now() };
      saveState(state);
      return;
    }
    sending = true;
    try {
      await send(petId, body);
      state = emptyState();
    } catch (err: any) {
      const status = err?.status;
      if (status === 400) {
        state = emptyState(); // datos que el servidor no acepta: se descartan
      } else {
        // Nunca se reintenta cada minuto: 429 (ya hay uno reciente, p. ej. de otro equipo) espera un
        // ciclo completo; otros errores HTTP (servidor sin el endpoint, 5xx) una hora; sin conexión,
        // 10 min. Los contadores se conservan.
        const wait = status === 429 ? SEND_EVERY_MS : typeof status === 'number' ? 3600_000 : 600_000;
        state = { ...state, lastSentAt: Date.now() - SEND_EVERY_MS + wait };
      }
    } finally {
      sending = false;
      saveState(state);
    }
  };

  const id = setInterval(tick, 60_000);
  return () => {
    clearInterval(id);
    window.removeEventListener('petai:pomodoro_event', onPomodoro);
  };
}
