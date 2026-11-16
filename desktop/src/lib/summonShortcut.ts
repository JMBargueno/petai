// Atajo global de la habilidad «Invocación rápida» (quick_summon).
//
// El registro lo hace Rust (plugin global-shortcut, comando `set_summon_shortcut`): al pulsarlo,
// la app emite `quick-summon` con la posición del cursor y aquí se reenvía como `petai:summon`,
// que es lo que escucha PetView. El atajo elegido se guarda en este equipo (localStorage) y solo
// se registra mientras la habilidad está autorizada, para no ocupar la combinación si está pausada.

import { get, writable } from 'svelte/store';
import { isSkillActive, skillAuthorizations } from './stores/desktopSkillsStore';

export const SUMMON_SKILL_ID = 'quick_summon';
export const DEFAULT_SUMMON_SHORTCUT = 'Ctrl+Alt+P';
const STORAGE_KEY = 'petai:quick_summon_shortcut';

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'OS']);

/** Nombres de tecla (KeyboardEvent.code) que no se deducen directamente. */
const CODE_NAMES: Record<string, string> = {
  Space: 'Space',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Minus: '-',
  Equal: '=',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backquote: '`',
};

function keyName(code: string): string | null {
  let m: RegExpExecArray | null;
  if ((m = /^Key([A-Z])$/.exec(code))) return m[1];
  if ((m = /^Digit([0-9])$/.exec(code))) return m[1];
  if ((m = /^Numpad([0-9])$/.exec(code))) return `Num${m[1]}`;
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  return CODE_NAMES[code] ?? null;
}

type KeyLike = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>;

export type CaptureResult =
  | { kind: 'pending'; preview: string }
  | { kind: 'done'; accelerator: string }
  | { kind: 'invalid'; reason: string };

/**
 * Traduce una pulsación a un acelerador de Tauri («Ctrl+Alt+P»). Se usa `code` (posición física)
 * para que no dependa de la distribución del teclado. Exige al menos Ctrl, Alt o Super:
 * un atajo global con solo Shift o sin modificadores robaría teclas al escribir.
 */
export function captureShortcut(e: KeyLike): CaptureResult {
  const mods: string[] = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Super');

  if (MODIFIER_KEYS.has(e.key)) return { kind: 'pending', preview: mods.join('+') };

  const key = keyName(e.code);
  if (!key) return { kind: 'invalid', reason: 'Esa tecla no se puede usar en un atajo global' };
  if (!e.ctrlKey && !e.altKey && !e.metaKey) {
    return { kind: 'invalid', reason: 'Combínala con Ctrl, Alt o Win' };
  }
  return { kind: 'done', accelerator: [...mods, key].join('+') };
}

/** Texto legible del acelerador para la interfaz. */
export function formatShortcut(accelerator: string): string {
  return accelerator.split('+').map((p) => (p === 'Super' ? 'Win' : p)).join(' + ');
}

export function loadSummonShortcut(): string {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw && raw.trim() ? raw : DEFAULT_SUMMON_SHORTCUT;
  } catch {
    return DEFAULT_SUMMON_SHORTCUT;
  }
}

/** Atajo elegido (persistido en este equipo). */
export const summonShortcut = writable<string>(loadSummonShortcut());

summonShortcut.subscribe((value) => {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, value);
  } catch {
    /* almacenamiento no disponible */
  }
});

const inTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Registra (o con `null` desactiva) el atajo global. Lanza un Error legible si falla. */
export async function registerSummonShortcut(accelerator: string | null): Promise<void> {
  if (!inTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  try {
    await invoke('set_summon_shortcut', { accelerator });
  } catch (err) {
    throw new Error(typeof err === 'string' ? err : (err as Error)?.message || 'No se pudo registrar el atajo');
  }
}

function skillEnabled(auth: Record<string, boolean>): boolean {
  // quick_summon no exige vínculo ni IA: basta con que esté autorizada
  return isSkillActive(SUMMON_SKILL_ID, auth, 0, 1);
}

/**
 * Cambia el atajo: primero se registra (si la habilidad está activa) y solo si funciona se guarda,
 * de modo que una combinación ocupada no deja la habilidad sin atajo.
 */
export async function changeSummonShortcut(accelerator: string): Promise<void> {
  if (skillEnabled(get(skillAuthorizations))) await registerSummonShortcut(accelerator);
  summonShortcut.set(accelerator);
}

/**
 * Arranque (App.svelte): mantiene el registro sincronizado con el atajo guardado y la
 * autorización de la habilidad, y reenvía las pulsaciones a PetView. Devuelve la limpieza.
 */
export function initSummonShortcut(): () => void {
  if (!inTauri()) return () => {};

  let wanted: string | null = null;
  const sync = () => {
    const next = skillEnabled(get(skillAuthorizations)) ? get(summonShortcut) : null;
    if (next === wanted) return;
    wanted = next;
    registerSummonShortcut(next).catch((err) => console.warn('[quick_summon]', err.message));
  };
  const stopAuth = skillAuthorizations.subscribe(sync);
  const stopShortcut = summonShortcut.subscribe(sync);

  let unlisten: (() => void) | null = null;
  let stopped = false;
  import('@tauri-apps/api/event')
    .then(({ listen }) =>
      listen<{ x: number; y: number } | null>('quick-summon', (e) => {
        window.dispatchEvent(new CustomEvent('petai:summon', { detail: e.payload ?? undefined }));
      }),
    )
    .then((fn) => (stopped ? fn() : (unlisten = fn)))
    .catch(() => {});

  return () => {
    stopped = true;
    stopAuth();
    stopShortcut();
    unlisten?.();
  };
}
