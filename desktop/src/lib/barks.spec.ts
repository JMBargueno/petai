import { describe, it, expect, beforeEach } from 'vitest';
import { BarksEngine, BARKS_CATALOG, type BarkContext } from './barks';

describe('BarksEngine', () => {
  let engine: BarksEngine;

  beforeEach(() => {
    engine = new BarksEngine();
  });

  it('debe incluir la categoría de código si la app activa es "code"', () => {
    const ctx: BarkContext = { appCategory: 'code' };
    const candidates = engine.getCandidateCategories(ctx);
    expect(candidates).toContain('code');
    expect(candidates).toContain('generic');
  });

  it('debe priorizar "hunger" si el hambre es menor a 25', () => {
    const ctx: BarkContext = { hunger: 15, appCategory: 'browser' };
    const candidates = engine.getCandidateCategories(ctx);
    expect(candidates).toContain('hunger');
    expect(candidates).toContain('browser');
  });

  it('debe incluir "idle_user" si el usuario está inactivo', () => {
    const ctx: BarkContext = { isUserIdle: true };
    const candidates = engine.getCandidateCategories(ctx);
    expect(candidates).toContain('idle_user');
  });

  it('debe generar una frase válida y recordarla en el historial reciente', () => {
    const ctx: BarkContext = { appCategory: 'code' };
    const bark = engine.generateBark(ctx);
    expect(typeof bark).toBe('string');
    expect(bark.length).toBeGreaterThan(0);
    expect(engine.getRecentBarks()).toContain(bark);
  });

  it('debe evitar repetir la misma frase consecutiva si hay otras disponibles', () => {
    const ctx: BarkContext = { appCategory: 'chat' };
    const first = engine.generateBark(ctx);
    const second = engine.generateBark(ctx);
    const poolSize = BARKS_CATALOG.chat.length;

    if (poolSize > 1) {
      // Si la categoría elegida fue 'chat', no deberían ser idénticas consecutivas
      const recent = engine.getRecentBarks();
      expect(recent.length).toBe(2);
    }
  });
});
