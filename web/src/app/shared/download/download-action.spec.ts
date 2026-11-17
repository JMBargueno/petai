import { describe, expect, it } from 'vitest';
import { downloadState } from './download-action';

const WIN = { os: 'windows' as const, mobile: false };
const IPHONE = { os: 'ios' as const, mobile: true };
const ANDROID = { os: 'android' as const, mobile: true };
const LINUX = { os: 'linux' as const, mobile: false };

describe('downloadState', () => {
  it('antes de conocer el dispositivo (prerender)', () => expect(downloadState(null, true, true)).toBe('pending'));
  it('en iOS y Android el escritorio se ve pero no se puede descargar', () => {
    expect(downloadState(IPHONE, true, true)).toBe('device');
    expect(downloadState(ANDROID, false, false)).toBe('device');
  });
  it('en Linux tampoco hay instalador', () => expect(downloadState(LINUX, true, true)).toBe('device'));
  it('sin sesión pide entrar', () => expect(downloadState(WIN, false, false)).toBe('login'));
  it('sin verificar pide verificar el correo', () => expect(downloadState(WIN, true, false)).toBe('verify'));
  it('verificado en escritorio: descarga', () => expect(downloadState(WIN, true, true)).toBe('ready'));
});
