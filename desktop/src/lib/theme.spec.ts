import { describe, expect, it } from 'vitest';
import { applyTheme, loadTheme, setTheme, THEME_STORAGE_KEY } from './theme';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

function fakeRoot() {
  const attrs: Record<string, string> = {};
  return {
    attrs,
    setAttribute: (k: string, v: string) => {
      attrs[k] = v;
    },
    removeAttribute: (k: string) => {
      delete attrs[k];
    },
  };
}

describe('theme', () => {
  it('usa el sistema cuando no hay nada guardado', () => {
    expect(loadTheme(fakeStorage())).toBe('system');
    expect(loadTheme(undefined)).toBe('system');
  });

  it('lee el tema guardado e ignora valores desconocidos', () => {
    expect(loadTheme(fakeStorage({ [THEME_STORAGE_KEY]: 'dark' }))).toBe('dark');
    expect(loadTheme(fakeStorage({ [THEME_STORAGE_KEY]: 'neon' }))).toBe('system');
  });

  it('no falla si el almacenamiento lanza', () => {
    const broken = {
      getItem: () => {
        throw new Error('bloqueado');
      },
    };
    expect(loadTheme(broken)).toBe('system');
  });

  it('aplica data-theme y lo quita al volver al sistema', () => {
    const root = fakeRoot();
    applyTheme('dark', root);
    expect(root.attrs['data-theme']).toBe('dark');
    applyTheme('light', root);
    expect(root.attrs['data-theme']).toBe('light');
    applyTheme('system', root);
    expect('data-theme' in root.attrs).toBe(false);
  });

  it('guarda la elección', () => {
    const storage = fakeStorage();
    setTheme('light', storage);
    expect(storage.data[THEME_STORAGE_KEY]).toBe('light');
    expect(loadTheme(storage)).toBe('light');
  });
});
