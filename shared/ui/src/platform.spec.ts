import { afterEach, describe, expect, it, vi } from 'vitest';
import { __resetPlatformForTests, getPlatform, isMobilePlatform, resolvePlatform, setPlatform } from './platform';

function fakeRoot() {
  const attrs: Record<string, string> = {};
  return { attrs, setAttribute: (k: string, v: string) => void (attrs[k] = v) };
}

afterEach(() => __resetPlatformForTests());

describe('platform', () => {
  it('es desktop si nadie la fija', () => {
    expect(getPlatform()).toBe('desktop');
    expect(isMobilePlatform()).toBe(false);
  });

  it('setPlatform la fija y la marca en la raíz', () => {
    const root = fakeRoot();
    setPlatform('android', root);
    expect(getPlatform()).toBe('android');
    expect(root.attrs['data-platform']).toBe('android');
    expect(isMobilePlatform()).toBe(true);
  });

  it('solo vale la primera llamada', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const root = fakeRoot();
    setPlatform('ios', root);
    expect(setPlatform('desktop', root)).toBe('ios');
    expect(getPlatform()).toBe('ios');
    expect(root.attrs['data-platform']).toBe('ios');
    expect(warn).toHaveBeenCalledOnce();
    // Repetir la misma no avisa.
    setPlatform('ios', root);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('resolvePlatform solo acepta ?platform en desarrollo y con un valor válido', () => {
    expect(resolvePlatform('android', '?platform=ios', true)).toBe('ios');
    expect(resolvePlatform('android', '?platform=ios', false)).toBe('android');
    expect(resolvePlatform('android', '?platform=windows', true)).toBe('android');
    expect(resolvePlatform('desktop', '', true)).toBe('desktop');
  });
});
