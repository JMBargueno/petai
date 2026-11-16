import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('./api', () => ({ api: { updateDesktopSkills: vi.fn(async () => undefined) } }));

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

const key = (over: Partial<KeyboardEvent>) =>
  ({ key: '', code: '', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...over }) as KeyboardEvent;

async function loadModule(storage = memoryStorage(), tauri = true) {
  vi.resetModules();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { ...(tauri ? { __TAURI_INTERNALS__: {} } : {}), localStorage: storage, dispatchEvent: vi.fn() });
  return { mod: await import('./summonShortcut'), skills: await import('./stores/desktopSkillsStore'), storage };
}

describe('captureShortcut', () => {
  it('construye el acelerador a partir de la tecla física', async () => {
    const { mod } = await loadModule();
    expect(mod.captureShortcut(key({ key: 'p', code: 'KeyP', ctrlKey: true, altKey: true }))).toEqual({
      kind: 'done',
      accelerator: 'Ctrl+Alt+P',
    });
    expect(mod.captureShortcut(key({ key: '1', code: 'Digit1', metaKey: true, shiftKey: true }))).toEqual({
      kind: 'done',
      accelerator: 'Shift+Super+1',
    });
    expect(mod.captureShortcut(key({ key: 'ArrowUp', code: 'ArrowUp', altKey: true }))).toEqual({
      kind: 'done',
      accelerator: 'Alt+Up',
    });
  });

  it('mientras solo hay modificadores queda pendiente', async () => {
    const { mod } = await loadModule();
    expect(mod.captureShortcut(key({ key: 'Control', code: 'ControlLeft', ctrlKey: true }))).toEqual({
      kind: 'pending',
      preview: 'Ctrl',
    });
  });

  it('rechaza atajos sin Ctrl, Alt o Win y teclas no soportadas', async () => {
    const { mod } = await loadModule();
    expect(mod.captureShortcut(key({ key: 'p', code: 'KeyP' })).kind).toBe('invalid');
    expect(mod.captureShortcut(key({ key: 'P', code: 'KeyP', shiftKey: true })).kind).toBe('invalid');
    expect(mod.captureShortcut(key({ key: 'Dead', code: 'IntlRo', ctrlKey: true })).kind).toBe('invalid');
  });

  it('formatShortcut lo muestra legible', async () => {
    const { mod } = await loadModule();
    expect(mod.formatShortcut('Ctrl+Super+P')).toBe('Ctrl + Win + P');
  });
});

describe('persistencia y registro del atajo', () => {
  beforeEach(() => invoke.mockReset().mockResolvedValue(undefined));
  afterEach(() => vi.unstubAllGlobals());

  it('usa el atajo por defecto si no hay ninguno guardado y recupera el guardado', async () => {
    const { mod } = await loadModule();
    expect(get(mod.summonShortcut)).toBe(mod.DEFAULT_SUMMON_SHORTCUT);
    const again = await loadModule(memoryStorage({ 'petai:quick_summon_shortcut': 'Alt+Shift+K' }));
    expect(get(again.mod.summonShortcut)).toBe('Alt+Shift+K');
  });

  it('al cambiarlo lo registra en Tauri y lo guarda', async () => {
    const { mod, storage } = await loadModule();
    await mod.changeSummonShortcut('Ctrl+Shift+Y');
    expect(invoke).toHaveBeenCalledWith('set_summon_shortcut', { accelerator: 'Ctrl+Shift+Y' });
    expect(get(mod.summonShortcut)).toBe('Ctrl+Shift+Y');
    expect(storage.data.get('petai:quick_summon_shortcut')).toBe('Ctrl+Shift+Y');
  });

  it('si el registro falla no guarda el nuevo atajo y propaga el motivo', async () => {
    const { mod } = await loadModule();
    invoke.mockRejectedValueOnce('No se pudo registrar el atajo (¿lo usa otra aplicación?)');
    await expect(mod.changeSummonShortcut('Ctrl+Shift+Y')).rejects.toThrow('lo usa otra aplicación');
    expect(get(mod.summonShortcut)).toBe(mod.DEFAULT_SUMMON_SHORTCUT);
  });

  it('initSummonShortcut registra el atajo y lo libera al pausar la habilidad', async () => {
    const { mod, skills } = await loadModule();
    const stop = mod.initSummonShortcut();
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('set_summon_shortcut', { accelerator: mod.DEFAULT_SUMMON_SHORTCUT }));

    skills.setSkillAuthorization('quick_summon', false);
    await vi.waitFor(() => expect(invoke).toHaveBeenLastCalledWith('set_summon_shortcut', { accelerator: null }));

    // Con la habilidad pausada, cambiar el atajo solo lo guarda (no ocupa la combinación)
    invoke.mockClear();
    await mod.changeSummonShortcut('Alt+Shift+K');
    expect(get(mod.summonShortcut)).toBe('Alt+Shift+K');
    expect(invoke).not.toHaveBeenCalled();
    stop();
  });

  it('fuera de Tauri no intenta registrar nada', async () => {
    const { mod } = await loadModule(memoryStorage(), false);
    await mod.changeSummonShortcut('Ctrl+Shift+Y');
    expect(invoke).not.toHaveBeenCalled();
    expect(get(mod.summonShortcut)).toBe('Ctrl+Shift+Y');
  });
});
