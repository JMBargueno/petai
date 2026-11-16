import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { updateState, hasUpdate, mockTriggerUpdate, type UpdateState } from './updater';

describe('updater', () => {
  beforeEach(() => {
    updateState.set({ status: 'idle' });
  });

  describe('hasUpdate', () => {
    it('devuelve true para estados available, downloading y ready', () => {
      expect(hasUpdate({ status: 'available', version: '1.2.0', notes: 'Notas' })).toBe(true);
      expect(hasUpdate({ status: 'downloading', version: '1.2.0', progress: 0.5 })).toBe(true);
      expect(hasUpdate({ status: 'ready', version: '1.2.0' })).toBe(true);
    });

    it('devuelve false para idle, checking, upToDate y error', () => {
      expect(hasUpdate({ status: 'idle' })).toBe(false);
      expect(hasUpdate({ status: 'checking' })).toBe(false);
      expect(hasUpdate({ status: 'upToDate' })).toBe(false);
      expect(hasUpdate({ status: 'error', message: 'Fallo' })).toBe(false);
    });
  });

  describe('mockTriggerUpdate', () => {
    it('establece el estado en available con versión y notas proporcionadas', () => {
      expect(get(updateState).status).toBe('idle');

      mockTriggerUpdate('2.0.0', 'Notas de versión de prueba');

      const current = get(updateState);
      expect(current.status).toBe('available');
      if (current.status === 'available') {
        expect(current.version).toBe('2.0.0');
        expect(current.notes).toBe('Notas de versión de prueba');
      }
    });

    it('usa notas por defecto si no se especifican', () => {
      mockTriggerUpdate('1.0.1');

      const current = get(updateState);
      expect(current.status).toBe('available');
      if (current.status === 'available') {
        expect(current.version).toBe('1.0.1');
        expect(current.notes).toContain('Actualización obligatoria');
      }
    });
  });
});
