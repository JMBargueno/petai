import { describe, expect, it } from 'vitest';
import { friendlyError } from './errors';

describe('friendlyError', () => {
  it('respeta los mensajes de negocio del servidor', () => {
    expect(friendlyError(new Error('No tienes suficientes monedas'))).toBe('No tienes suficientes monedas');
  });

  it('traduce los fallos de red', () => {
    expect(friendlyError(new TypeError('Failed to fetch'))).toMatch(/Sin conexión/);
    expect(friendlyError(new Error('NetworkError when attempting to fetch resource.'))).toMatch(/Sin conexión/);
  });

  it('oculta los errores técnicos', () => {
    const fallback = 'No se pudo cargar';
    expect(friendlyError(new Error('Cannot convert undefined or null to object'), fallback)).toBe(fallback);
    expect(friendlyError(new Error('Internal Server Error'), fallback)).toBe(fallback);
    expect(friendlyError(new Error('500 Internal'), fallback)).toBe(fallback);
    expect(friendlyError(new Error('x.map is not a function'), fallback)).toBe(fallback);
  });

  it('usa el texto por defecto si no hay mensaje', () => {
    expect(friendlyError(null)).toMatch(/Algo ha fallado/);
    expect(friendlyError(new Error(''))).toMatch(/Algo ha fallado/);
  });
});
