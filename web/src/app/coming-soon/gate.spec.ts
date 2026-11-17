import { describe, expect, it } from 'vitest';
import { countdownTo } from './coming-soon';
import { isGateExempt, shouldGate } from './gate';

describe('isGateExempt', () => {
  it('deja pasar las páginas de cuenta y el panel', () => {
    for (const url of ['/login', '/login?next=%2F', '/register', '/forgot-password', '/verify-email?token=x', '/admin', '/admin/sitio']) {
      expect(isGateExempt(url)).toBe(true);
    }
  });
  it('tapa el resto', () => {
    for (const url of ['/', '/lore', '/pockais', '/arena', '/contact', '/account', '/#descargar', '/loginx']) {
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
  it('rutas exentas: pasa aunque no haya sesión', () => expect(shouldGate({ ...base, url: '/login' })).toBe(false));
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
