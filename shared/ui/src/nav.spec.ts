import { describe, expect, it } from 'vitest';
import {
  DESKTOP_NAV_BAR,
  MOBILE_NAV_BAR,
  NAV_DESTS,
  NAV_LABELS,
  defaultSub,
  isNavDest,
  isNavSub,
  navSubs,
  resolveNav,
} from './nav';

describe('modelo de navegación', () => {
  it('cada destino tiene etiqueta', () => {
    for (const dest of NAV_DESTS) expect(NAV_LABELS[dest]).toBeTruthy();
  });

  it('la barra del escritorio más Ajustes cubre todos los destinos, sin repetir', () => {
    expect([...DESKTOP_NAV_BAR, 'settings'].sort()).toEqual([...NAV_DESTS].sort());
  });

  it('la barra móvil tiene cinco pestañas y no incluye tienda ni ajustes', () => {
    expect(MOBILE_NAV_BAR).toHaveLength(5);
    expect(MOBILE_NAV_BAR).not.toContain('shop');
    expect(MOBILE_NAV_BAR).not.toContain('settings');
  });

  it('las claves unificadas existen (hatch, bonding, seasons)', () => {
    expect(isNavSub('pet', 'hatch')).toBe(true);
    expect(isNavSub('pet', 'bonding')).toBe(true);
    expect(isNavSub('progress', 'seasons')).toBe(true);
    expect(isNavSub('pet', 'eggs')).toBe(false);
    expect(isNavSub('pet', 'bond')).toBe(false);
    expect(isNavSub('progress', 'season')).toBe(false);
  });

  it('defaultSub devuelve la primera sección de cada destino', () => {
    expect(defaultSub('pet')).toBe('home');
    expect(defaultSub('progress')).toBe('missions');
    expect(defaultSub('chat')).toBeUndefined();
    expect(navSubs('chat')).toEqual([]);
  });
});

describe('resolveNav', () => {
  it('resuelve destino y sección válidos', () => {
    expect(resolveNav('shop', 'chests')).toEqual({ dest: 'shop', sub: 'chests' });
    expect(resolveNav('pet', 'hatch')).toEqual({ dest: 'pet', sub: 'hatch' });
  });

  it('sin sección usa la primera del destino', () => {
    expect(resolveNav('social')).toEqual({ dest: 'social', sub: 'profile' });
    expect(resolveNav('chat')).toEqual({ dest: 'chat', sub: undefined });
  });

  it('rechaza destinos y secciones desconocidos', () => {
    expect(resolveNav('inventario')).toBeNull();
    expect(resolveNav('pet', 'eggs')).toBeNull();
    expect(resolveNav('chat', 'historial')).toBeNull();
  });

  it('«account» apunta a Ajustes › Cuenta', () => {
    expect(resolveNav('account')).toEqual({ dest: 'settings', sub: 'account' });
  });

  it('isNavDest acepta solo claves reales', () => {
    expect(isNavDest('pet')).toBe(true);
    expect(isNavDest('toString')).toBe(false);
  });
});
