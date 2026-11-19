import { describe, expect, it } from 'vitest';
import { normalizeManifest } from '@pockai/audio/manifest';
import soundsJson from '../../../game-data/sounds.json';
import { ACTIONS_WITH_CLIPS, clipsForPetAction } from './clips';
import { CLIP_SOUNDS, extraSoundsForPetAction, moodForBase, soundForClip, voiceForPet } from './sounds';

const { manifest } = normalizeManifest(soundsJson);

/** Clips de reacción que aún no tienen sonido del Pockai: suenan con su efecto (F2). */
const SILENT_CLIPS = new Set(['level_up', 'evolution', 'summon']);

describe('sonidos del Pockai', () => {
  it('cada sonido de la tabla existe en sounds.json y es del bus pet', () => {
    const ids = [...Object.values(CLIP_SOUNDS), ...ACTIONS_WITH_CLIPS.flatMap((a) => extraSoundsForPetAction(a, {}))];
    for (const id of ids) {
      expect(manifest.sounds.has(id), id).toBe(true);
      expect(manifest.sounds.get(id)!.bus, id).toBe('pet');
    }
  });

  it('todo clip que pone un aviso del backend tiene sonido (salvo los de F2)', () => {
    const ctxs = [{}, { favorite: true }, { result: 'win' }, { result: 'lose' }, { act: 'dance' }, { act: 'cry' }, { tier: 'emotional' }];
    for (const action of ACTIONS_WITH_CLIPS) {
      for (const ctx of ctxs) {
        for (const clip of clipsForPetAction(action, ctx) ?? []) {
          if (SILENT_CLIPS.has(clip)) continue;
          expect(soundForClip(clip), `${action} → ${clip}`).not.toBeNull();
        }
      }
    }
  });

  it('los bucles no suenan como reacción', () => {
    for (const clip of ['idle', 'walk', 'sleep', 'perch', 'fall']) expect(soundForClip(clip)).toBeNull();
  });

  it('la voz sale de la especie: elemento y rareza del catálogo', () => {
    expect(voiceForPet({ speciesId: 'ignisaur', stage: 'baby' })).toEqual({ species: 'ignisaur', stage: 'baby', element: 'fire', rarity: 'normal' });
    expect(voiceForPet({ speciesId: 'leviatin', stage: 'final', shiny: true }).rarity).toBe('mythic');
    expect(voiceForPet({ speciesId: 'desconocida', stage: 'raro' })).toEqual({ species: 'desconocida' });
  });

  it('humor según el estado base', () => {
    expect(moodForBase('sick')).toBe('sick');
    expect(moodForBase('hungry')).toBe('sad');
    expect(moodForBase('idle')).toBe('neutral');
  });
});
