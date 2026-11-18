import { writable } from 'svelte/store';

/**
 * Tema de la interfaz: seguir al sistema o forzar claro/oscuro (Ajustes › Escritorio).
 *
 * Se guarda en localStorage y se aplica como `data-theme` en <html>; tokens.css cambia
 * `color-scheme` y todos los tokens `light-dark()` se resuelven solos. Sin atributo, manda el sistema.
 */
export type ThemeChoice = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'pockai_theme';
const CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark'];

type ReadStorage = Pick<Storage, 'getItem'>;
type WriteStorage = Pick<Storage, 'setItem'>;
type ThemeRoot = { setAttribute(name: string, value: string): void; removeAttribute(name: string): void };

function defaultStorage(): Storage | undefined {
  return typeof localStorage !== 'undefined' ? localStorage : undefined;
}

export function loadTheme(storage: ReadStorage | undefined = defaultStorage()): ThemeChoice {
  try {
    const raw = storage?.getItem(THEME_STORAGE_KEY);
    return CHOICES.includes(raw as ThemeChoice) ? (raw as ThemeChoice) : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(
  choice: ThemeChoice,
  root: ThemeRoot | undefined = typeof document !== 'undefined' ? document.documentElement : undefined,
) {
  if (!root) return;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

export const theme = writable<ThemeChoice>(loadTheme());

/** Cambia el tema, lo aplica al documento y lo recuerda para el próximo arranque. */
export function setTheme(choice: ThemeChoice, storage: WriteStorage | undefined = defaultStorage()) {
  theme.set(choice);
  applyTheme(choice);
  try {
    storage?.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    /* almacenamiento indisponible: el tema vale solo para esta sesión */
  }
}

/** Aplica el tema guardado. Se llama en main.ts antes de montar la app para evitar el parpadeo. */
export function initTheme() {
  applyTheme(loadTheme());
}
