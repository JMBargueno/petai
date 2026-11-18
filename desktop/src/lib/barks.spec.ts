import { describe, it, expect, beforeEach } from 'vitest';
import { BarksEngine, BARKS_CATALOG, barkCategoryForApp, fillBark, type BarkContext } from './barks';
import { categorizeWindowTitle, localTopicOf, type AppCategory } from './contextAwareness';

/** Generador determinista para los tests: recorre una lista fija de valores. */
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('BarksEngine', () => {
  let engine: BarksEngine;

  beforeEach(() => {
    engine = new BarksEngine();
  });

  it('traduce cada categoría real de app a una categoría de frases con contenido', () => {
    const apps: AppCategory[] = ['coding', 'music', 'video', 'gaming', 'reading'];
    for (const app of apps) {
      const bark = barkCategoryForApp(app);
      expect(bark, app).not.toBeNull();
      expect(BARKS_CATALOG[bark!].length, app).toBeGreaterThan(0);
      expect(engine.getCandidateCategories({ appCategory: app })).toContain(bark);
    }
    expect(barkCategoryForApp('generic')).toBeNull();
    expect(barkCategoryForApp(null)).toBeNull();
  });

  it('el título de una ventana de código acaba dando frases de código', () => {
    const { category } = categorizeWindowTitle('main.rs - petai - Visual Studio Code');
    expect(engine.getCandidateCategories({ appCategory: category })).toContain('code');
  });

  it('añade el tema local (navegador, mensajería) sin tocar la categoría de app', () => {
    expect(localTopicOf('Bandeja de entrada - Google Chrome')).toBe('browser');
    expect(localTopicOf('#general | Discord')).toBe('chat');
    expect(localTopicOf('Bloc de notas')).toBeNull();
    const candidates = engine.getCandidateCategories({ appCategory: 'generic', localTopic: 'browser' });
    expect(candidates).toContain('browser');
  });

  it('cubre los cinco tramos del día', () => {
    for (const t of ['late_night', 'morning', 'afternoon', 'evening', 'night']) {
      expect(engine.getCandidateCategories({ timeOfDay: t }), t).toContain(t);
    }
  });

  it('debe priorizar "hunger" si el hambre es menor a 25', () => {
    const ctx: BarkContext = { hunger: 15, localTopic: 'browser' };
    const candidates = engine.getCandidateCategories(ctx);
    expect(candidates[0]).toBe('hunger');
    expect(candidates).toContain('browser');
  });

  it('usuario inactivo y tecleando son excluyentes', () => {
    expect(engine.getCandidateCategories({ isUserIdle: true })).toContain('idle_user');
    expect(engine.getCandidateCategories({ isTyping: true })).toContain('typing');
    expect(engine.getCandidateCategories({ isUserIdle: true, isTyping: true })).not.toContain('typing');
  });

  it('es determinista con un generador inyectado', () => {
    const ctx: BarkContext = { appCategory: 'coding' };
    const a = new BarksEngine(seq([0.1, 0, 0.5])).generateBark(ctx);
    const b = new BarksEngine(seq([0.1, 0, 0.5])).generateBark(ctx);
    expect(a).toBe(b);
    expect(BARKS_CATALOG.code).toContain(a);
  });

  it('no repite frase mientras queden otras en la categoría', () => {
    const rng = seq([0]);
    const first = engine.barkFrom('chat', null, rng);
    const second = engine.barkFrom('chat', null, rng);
    expect(second).not.toBe(first);
    expect(engine.getRecentBarks()).toHaveLength(2);
  });

  it('pone el nombre de la mascota en las frases que lo piden', () => {
    expect(fillBark('{name} de guardia', 'Brasa')).toBe('Brasa de guardia');
    expect(fillBark('{name} de guardia', '')).toBe('tu Pockai de guardia');
    // Ninguna frase del catálogo llega al usuario con la marca sin resolver
    for (const pool of Object.values(BARKS_CATALOG)) {
      for (const text of pool) expect(fillBark(text, 'Brasa')).not.toContain('{name}');
    }
  });
});
