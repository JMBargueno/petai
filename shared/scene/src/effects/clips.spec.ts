import { describe, expect, it } from 'vitest';
import { clipsForPetAction } from './index';

describe('clipsForPetAction (tabla compartida escritorio / escena)', () => {
  it('pone las animaciones del momento en orden', () => {
    expect(clipsForPetAction('evolved')).toEqual(['evolution', 'celebrate']);
    expect(clipsForPetAction('fed', { favorite: true })).toEqual(['eat', 'love']);
    expect(clipsForPetAction('battle_defended', { won: true })).toEqual(['hit', 'victory']);
    expect(clipsForPetAction('welcome_back', { tier: 'emotional' })).toEqual(['cry', 'love']);
  });

  it('el Mood Theater exagerado repite el acto y los actos desconocidos no reaccionan', () => {
    expect(clipsForPetAction('mood_moment', { act: 'dance', intensity: 'exaggerated' })).toEqual(['dance', 'dance']);
    expect(clipsForPetAction('mood_moment', { act: 'inventado' })).toBeNull();
  });

  it('distingue «sin reacción» (null) de «reacción sin clip» ([])', () => {
    expect(clipsForPetAction('vitals_critical')).toBeNull();
    expect(clipsForPetAction('accion_inventada')).toBeNull();
    expect(clipsForPetAction('slept')).toEqual([]);
  });
});
