import { describe, it, expect } from 'vitest';
import { categorizeWindowTitle } from './contextAwareness';

describe('contextAwareness', () => {
  it('identifica ventanas de programación y desarrollo', () => {
    const res = categorizeWindowTitle('desktop/src/App.svelte - PetAI - Visual Studio Code');
    expect(res.category).toBe('coding');
    expect(res.accessoryIcon).toBe('👓');
  });

  it('identifica reproductores y apps de música', () => {
    const res = categorizeWindowTitle('Daft Punk - Around the World - Spotify Free');
    expect(res.category).toBe('music');
    expect(res.accessoryIcon).toBe('🎵');
  });

  it('identifica plataformas de streaming de vídeo', () => {
    const res = categorizeWindowTitle('LoFi Hip Hop Radio - Beats to relax/study to - YouTube - Google Chrome');
    expect(res.category).toBe('video');
    expect(res.accessoryIcon).toBe('🍿');
  });

  it('identifica launchers y videojuegos', () => {
    const res = categorizeWindowTitle('Steam - Library');
    expect(res.category).toBe('gaming');
    expect(res.accessoryIcon).toBe('🎮');
  });

  it('clasifica ventanas no reconocidas como genéricas', () => {
    const res = categorizeWindowTitle('Calculadora');
    expect(res.category).toBe('generic');
    expect(res.accessoryIcon).toBe('✨');
  });
});
