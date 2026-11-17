import { describe, expect, it } from 'vitest';
import { countdownTo } from './coming-soon';
import { isGateExempt, shouldGate } from './gate';

describe('isGateExempt', () => {
  it('deja pasar únicamente el panel de administración', () => {
    for (const url of ['/admin', '/admin/sitio', '/admin/login']) {
      expect(isGateExempt(url)).toBe(true);
    }
  });
  it('tapa las páginas de cuenta, contacto y el resto de la web', () => {
    for (const url of ['/', '/login', '/login?next=%2F', '/register', '/forgot-password', '/verify-email?token=x', '/lore', '/pockais', '/arena', '/contact', '/account', '/#descargar', '/loginx']) {
      expect(isGateExempt(url)).toBe(false);
    }
  });
});

describe('shouldGate', () => {
  const base = { comingSoon: true, loggedIn: false, verified: false, url: '/' };
  it('desactivada: nunca tapa', () => expect(shouldGate({ ...base, comingSoon: false })).toBe(false));
  it('sin sesión: tapa', () => expect(shouldGate(base)).toBe(true));
  it('con sesión sin verificar: tapa', () => expect(shouldGate({ ...base, loggedIn: true })).toBe(true));
  it('con sesión verificada: pasa', () => expect(shouldGate({ ...base, loggedIn: true, verified: true })).toBe(false));
  it('panel admin: pasa aunque no haya sesión', () => expect(shouldGate({ ...base, url: '/admin' })).toBe(false));
  it('login directo: tapa para abrirse en modal', () => expect(shouldGate({ ...base, url: '/login' })).toBe(true));
});

describe('countdownTo', () => {
  const now = Date.parse('2026-11-18T10:00:00Z');
  it('descompone el tiempo restante', () =>
    expect(countdownTo('2026-11-20T12:30:15Z', now)).toEqual({ days: 2, hours: 2, minutes: 30, seconds: 15 }));
  it('fecha pasada, vacía o inválida: sin cuenta atrás', () => {
    expect(countdownTo('2026-11-18T09:00:00Z', now)).toBeNull();
    expect(countdownTo(null, now)).toBeNull();
    expect(countdownTo('mañana', now)).toBeNull();
  });
});
