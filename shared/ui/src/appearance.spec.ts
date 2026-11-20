import { get } from 'svelte/store';
import { afterEach, describe, expect, it } from 'vitest';
import {
  APPEARANCE_KEY,
  LEGACY_THEME_KEY,
  appearance,
  applyAppearance,
  canvasPalette,
  effectiveScheme,
  forcedScheme,
  initAppearance,
  loadAppearance,
  setAppearance,
} from './appearance';
import { THEMES } from './themes';
import type { ThemeManifest } from './themes';

function fakeStorage(initial: Record<string, string> = {}) {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => void (data[k] = v),
    removeItem: (k: string) => void delete data[k],
  };
}

function fakeRoot() {
  const attrs: Record<string, string> = {};
  return {
    attrs,
    setAttribute: (k: string, v: string) => void (attrs[k] = v),
    removeAttribute: (k: string) => void delete attrs[k],
  };
}

function fakeWindow() {
  const listeners = new Set<(e: { key: string | null }) => void>();
  return {
    listeners,
    addEventListener: (_: 'storage', cb: (e: { key: string | null }) => void) => void listeners.add(cb),
    removeEventListener: (_: 'storage', cb: (e: { key: string | null }) => void) => void listeners.delete(cb),
    emit: (key: string | null) => listeners.forEach((cb) => cb({ key })),
  };
}

afterEach(() => appearance.set({ theme: 'classic', scheme: 'system' }));

describe('appearance', () => {
  it('por defecto es el tema clásico siguiendo al sistema', () => {
    expect(loadAppearance(fakeStorage())).toEqual({ theme: 'classic', scheme: 'system' });
    expect(loadAppearance(undefined)).toEqual({ theme: 'classic', scheme: 'system' });
  });

  it('lee lo guardado e ignora temas y esquemas desconocidos', () => {
    const s = fakeStorage({ [APPEARANCE_KEY]: JSON.stringify({ v: 1, theme: 'cozy', scheme: 'dark' }) });
    expect(loadAppearance(s)).toEqual({ theme: 'cozy', scheme: 'dark' });
    const bad = fakeStorage({ [APPEARANCE_KEY]: JSON.stringify({ theme: 'neon', scheme: 'sepia' }) });
    expect(loadAppearance(bad)).toEqual({ theme: 'classic', scheme: 'system' });
    expect(loadAppearance(fakeStorage({ [APPEARANCE_KEY]: '{roto' }))).toEqual({ theme: 'classic', scheme: 'system' });
  });

  it('no falla si el almacenamiento lanza', () => {
    const broken = {
      getItem: () => {
        throw new Error('bloqueado');
      },
    };
    expect(loadAppearance(broken)).toEqual({ theme: 'classic', scheme: 'system' });
  });

  it('migra el antiguo pockai_theme del escritorio y borra la clave vieja', () => {
    const s = fakeStorage({ [LEGACY_THEME_KEY]: 'dark' });
    expect(loadAppearance(s)).toEqual({ theme: 'classic', scheme: 'dark' });
    expect(JSON.parse(s.data[APPEARANCE_KEY])).toEqual({ v: 1, theme: 'classic', scheme: 'dark' });
    expect(LEGACY_THEME_KEY in s.data).toBe(false);
  });

  it('applyAppearance pone data-theme siempre y data-scheme solo si se fuerza', () => {
    const root = fakeRoot();
    applyAppearance({ theme: 'cozy', scheme: 'light' }, root);
    expect(root.attrs).toEqual({ 'data-theme': 'cozy', 'data-scheme': 'light' });
    applyAppearance({ theme: 'classic', scheme: 'system' }, root);
    expect(root.attrs).toEqual({ 'data-theme': 'classic' });
  });

  it('un tema de un solo esquema lo fuerza, pero se conserva la elección del jugador', () => {
    const nocturne: ThemeManifest = { ...THEMES[0], id: '__night', schemes: ['dark'] };
    (THEMES as ThemeManifest[]).push(nocturne);
    try {
      const a = { theme: '__night', scheme: 'light' as const };
      expect(forcedScheme(a)).toBe('dark');
      expect(effectiveScheme(a, false)).toBe('dark');
      const root = fakeRoot();
      applyAppearance(a, root);
      expect(root.attrs['data-scheme']).toBe('dark');
      // Al volver a un tema con los dos esquemas, vale otra vez la elección guardada.
      expect(forcedScheme({ ...a, theme: 'classic' })).toBe('light');
    } finally {
      (THEMES as ThemeManifest[]).pop();
    }
  });

  it('effectiveScheme sigue al sistema cuando no se fuerza', () => {
    expect(effectiveScheme({ theme: 'classic', scheme: 'system' }, true)).toBe('dark');
    expect(effectiveScheme({ theme: 'classic', scheme: 'system' }, false)).toBe('light');
    expect(effectiveScheme({ theme: 'classic', scheme: 'light' }, true)).toBe('light');
  });

  it('setAppearance actualiza el store, normaliza y guarda', () => {
    const s = fakeStorage();
    setAppearance({ theme: 'cozy' }, s);
    expect(get(appearance)).toEqual({ theme: 'cozy', scheme: 'system' });
    setAppearance({ scheme: 'dark', theme: 'inexistente' }, s);
    expect(get(appearance)).toEqual({ theme: 'classic', scheme: 'dark' });
    expect(JSON.parse(s.data[APPEARANCE_KEY])).toMatchObject({ theme: 'classic', scheme: 'dark' });
  });

  it('initAppearance aplica lo guardado y se sincroniza con otras ventanas', () => {
    const s = fakeStorage({ [APPEARANCE_KEY]: JSON.stringify({ theme: 'cozy', scheme: 'light' }) });
    const root = fakeRoot();
    const win = fakeWindow();
    const stop = initAppearance({ storage: s, root, win });
    expect(get(appearance)).toEqual({ theme: 'cozy', scheme: 'light' });
    expect(root.attrs['data-theme']).toBe('cozy');

    // Otra ventana cambia la apariencia: llega como evento `storage`.
    s.data[APPEARANCE_KEY] = JSON.stringify({ theme: 'classic', scheme: 'dark' });
    win.emit('otra_clave');
    expect(get(appearance).theme).toBe('cozy');
    win.emit(APPEARANCE_KEY);
    expect(get(appearance)).toEqual({ theme: 'classic', scheme: 'dark' });
    expect(root.attrs).toEqual({ 'data-theme': 'classic', 'data-scheme': 'dark' });

    stop();
    expect(win.listeners.size).toBe(0);
  });

  it('canvasPalette da la paleta del tema y esquema', () => {
    const cozy = THEMES.find((t) => t.id === 'cozy')!;
    expect(canvasPalette({ theme: 'cozy', scheme: 'dark' })).toBe(cozy.canvas.dark);
    expect(canvasPalette({ theme: 'nada', scheme: 'light' })).toBe(THEMES[0].canvas.light);
  });
});
