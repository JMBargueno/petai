import { describe, expect, it } from 'vitest';
import { DEFAULT_STAGE, sheetKey } from './sprites';
import { speciesPalette } from './speciesPalette';

describe('sheetKey: etapa evolutiva de la hoja', () => {
  it('sin etapa dibuja la de bebé, no la adulta', () => {
    expect(DEFAULT_STAGE).toBe('baby');
    expect(sheetKey('ignisaur')).toBe('ignisaur/baby');
    expect(sheetKey('ignisaur', null)).toBe('ignisaur/baby');
    expect(sheetKey('ignisaur', '')).toBe('ignisaur/baby');
  });

  it('respeta la etapa que llega (adult es la hoja base de la especie)', () => {
    expect(sheetKey('ignisaur', 'baby')).toBe('ignisaur/baby');
    expect(sheetKey('ignisaur', 'juvenile')).toBe('ignisaur/juvenile');
    expect(sheetKey('ignisaur', 'adult')).toBe('ignisaur');
    expect(sheetKey('ignisaur', 'final')).toBe('ignisaur/final');
  });
});

describe('speciesPalette', () => {
  it('da la paleta por defecto de la especie y un fallback si no la conoce', () => {
    expect(speciesPalette('ignisaur').primary).toBe('#FB2910');
    expect(speciesPalette('no-existe').primary).toMatch(/^#/);
    expect(speciesPalette(undefined).secondary).toMatch(/^#/);
  });
});
