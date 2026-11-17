import { describe, expect, it } from 'vitest';
import { groupMemoriesByLayer, layerOfMemory, layerUsage, memoryIcon, relativeTime, valenceView } from './mind';

describe('layerOfMemory', () => {
  it('usa la capa si es válida y si no la deduce del tipo', () => {
    expect(layerOfMemory({ layer: 'emotional', kind: 'fact' })).toBe('emotional');
    expect(layerOfMemory({ layer: null, kind: 'summary' })).toBe('episodic');
    expect(layerOfMemory({ layer: undefined, kind: 'encounter' })).toBe('episodic');
    expect(layerOfMemory({ layer: 'rara', kind: 'relation' })).toBe('emotional');
    expect(layerOfMemory({ kind: 'habit' })).toBe('semantic');
  });
});

describe('groupMemoriesByLayer', () => {
  it('reparte en las tres capas conservando el orden', () => {
    const g = groupMemoriesByLayer([
      { id: 'a', layer: 'semantic', kind: 'fact' },
      { id: 'b', layer: 'episodic', kind: 'event' },
      { id: 'c', layer: 'semantic', kind: 'habit' },
      { id: 'd', layer: 'emotional', kind: 'relation' },
    ]);
    expect(g.semantic.map((m) => m.id)).toEqual(['a', 'c']);
    expect(g.episodic.map((m) => m.id)).toEqual(['b']);
    expect(g.emotional.map((m) => m.id)).toEqual(['d']);
    expect(groupMemoriesByLayer([])).toEqual({ episodic: [], semantic: [], emotional: [] });
  });
});

describe('valenceView', () => {
  it('describe la valencia con signo', () => {
    expect(valenceView(0.8)).toEqual({ tone: 'pos', label: 'Le encanta', text: '+0.8' });
    expect(valenceView(0.3).label).toBe('Le agrada');
    expect(valenceView(0)).toEqual({ tone: 'neutral', label: 'Neutral', text: '0.0' });
    expect(valenceView(-0.4)).toMatchObject({ tone: 'neg', label: 'Le incomoda' });
    expect(valenceView(-5)).toMatchObject({ tone: 'neg', label: 'Le duele', text: '−1.0' });
    expect(valenceView(null).tone).toBe('neutral');
  });
});

describe('layerUsage', () => {
  it('calcula el porcentaje y tolera capacidad nula', () => {
    expect(layerUsage(10, 40)).toBe(25);
    expect(layerUsage(50, 40)).toBe(100);
    expect(layerUsage(3, null)).toBe(0);
    expect(layerUsage(3, 0)).toBe(0);
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-11-17T12:00:00Z');
  it('formatea en castellano', () => {
    expect(relativeTime('2026-11-17T11:59:50Z', now)).toBe('ahora mismo');
    expect(relativeTime('2026-11-17T11:55:00Z', now)).toBe('hace 5 minutos');
    expect(relativeTime('2026-11-17T09:00:00Z', now)).toBe('hace 3 horas');
    expect(relativeTime('2026-11-16T12:00:00Z', now)).toBe('ayer');
    expect(relativeTime('no-es-fecha', now)).toBe('');
  });
});

describe('memoryIcon', () => {
  it('da un icono por tipo con uno por defecto', () => {
    expect(memoryIcon('encounter')).toBe('users');
    expect(memoryIcon('desconocido')).toBe('chat');
  });
});
