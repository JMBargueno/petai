import { describe, expect, it } from 'vitest';
import { countdownTo } from './coming-soon';
import { isGateExempt, resolveGate, shouldGate } from './gate';

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

describe('resolveGate', () => {
  const base = {
    down: false,
    maintenance: false,
    maintenanceScope: 'all' as const,
    isAdmin: false,
    comingSoon: false,
    loggedIn: false,
    verified: false,
    url: '/',
  };
  it('todo desactivado: no tapa', () => expect(resolveGate(base)).toBeNull());
  it('backend caído: tapa todo, incluido el panel y a los admins', () => {
    expect(resolveGate({ ...base, down: true })).toBe('down');
    expect(resolveGate({ ...base, down: true, url: '/admin/login' })).toBe('down');
    expect(resolveGate({ ...base, down: true, isAdmin: true, maintenance: true, comingSoon: true })).toBe('down');
  });
  it('mantenimiento con alcance web o todo: tapa', () => {
    expect(resolveGate({ ...base, maintenance: true })).toBe('maintenance');
    expect(resolveGate({ ...base, maintenance: true, maintenanceScope: 'web', url: '/contact' })).toBe('maintenance');
  });
  it('mantenimiento solo de apps: la web sigue abierta', () =>
    expect(resolveGate({ ...base, maintenance: true, maintenanceScope: 'apps' })).toBeNull());
  it('mantenimiento: pasan el panel y los admins', () => {
    expect(resolveGate({ ...base, maintenance: true, url: '/admin' })).toBeNull();
    expect(resolveGate({ ...base, maintenance: true, url: '/admin/sitio' })).toBeNull();
    expect(resolveGate({ ...base, maintenance: true, isAdmin: true, loggedIn: true, verified: true })).toBeNull();
  });
  it('mantenimiento manda sobre «Coming soon»', () =>
    expect(resolveGate({ ...base, maintenance: true, comingSoon: true })).toBe('maintenance'));
  it('un admin en mantenimiento sigue viendo «Coming soon» si no ha verificado el correo', () =>
    expect(resolveGate({ ...base, maintenance: true, comingSoon: true, isAdmin: true, loggedIn: true })).toBe('coming-soon'));
  it('sin mantenimiento: «Coming soon» como siempre', () => {
    expect(resolveGate({ ...base, comingSoon: true })).toBe('coming-soon');
    expect(resolveGate({ ...base, comingSoon: true, loggedIn: true, verified: true })).toBeNull();
  });
});
