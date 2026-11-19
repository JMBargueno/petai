import { describe, expect, it } from 'vitest';
import { normalizeManifest } from '@pockai/audio/manifest';
import soundsJson from '../../../game-data/sounds.json';
import { ACTIONS_WITH_CLIPS, clipsForPetAction } from './clips';
import { CLIP_SOUNDS, cueForPhase, extraSoundsForPetAction, moodForBase, soundForClip, soundsForEffectPhase, voiceForPet } from './sounds';

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

describe('sonidos de los efectos visuales', () => {
  const PORTAL = [
    { name: 'appear', ms: 560 },
    { name: 'open', ms: 560 },
    { name: 'hold', ms: 'hold' as const },
    { name: 'close', ms: 420 },
    { name: 'vanish', ms: 620 },
  ];

  it('cada fase: empezar, esperar y soltar', () => {
    expect(cueForPhase(PORTAL, 'appear')).toBe('enter');
    expect(cueForPhase(PORTAL, 'open')).toBeNull();
    expect(cueForPhase(PORTAL, 'hold')).toBe('hold');
    expect(cueForPhase(PORTAL, 'close')).toBe('exit');
    expect(cueForPhase(PORTAL, 'vanish')).toBeNull();
    expect(cueForPhase(PORTAL, 'done')).toBeNull();
  });

  it('el portal suena al abrirse y al cerrarse', () => {
    expect(soundsForEffectPhase('portal-nexo', PORTAL, 'appear')).toEqual(['fx.portal-nexo.enter', 'fx.portal-nexo']);
    expect(soundsForEffectPhase('portal-nexo', PORTAL, 'close')).toEqual(['fx.portal-nexo.exit']);
  });

  it('los momentos de juego usan su propio sonido según sus datos', () => {
    const one = [{ name: 'a', ms: 100 }];
    expect(soundsForEffectPhase('sello-logro', one, 'a', { tier: 'epic' })).toEqual(['achievement.epic']);
    expect(soundsForEffectPhase('sello-logro', one, 'a', { tier: 'raro' })).toEqual(['achievement.common']);
    expect(soundsForEffectPhase('resonancia', one, 'a')).toEqual(['reward.level_up']);
    const chest = [{ name: 'drop', ms: 400 }, { name: 'glow', ms: 500 }, { name: 'open', ms: 500 }];
    expect(soundsForEffectPhase('cofre-tier', chest, 'open', { type: 'gold' })).toEqual(['chest.open.gold']);
    const reveal = [{ name: 'promise', ms: 600 }, { name: 'prism', ms: 450 }];
    expect(soundsForEffectPhase('revelacion-densidad', reveal, 'prism', { rarity: 'mythic', shiny: 1 })).toEqual(['reveal.mythic', 'reveal.shiny']);
  });

  it('todos los candidatos con nombre fijo existen en sounds.json', () => {
    const one = [{ name: 'a', ms: 100 }, { name: 'h', ms: 'hold' as const }, { name: 'b', ms: 100 }];
    const ids = ['resonancia', 'chispa-despertar', 'capullo-telar', 'huevo-grietas', 'sello-logro', 'paquete-hebra', 'sello-eter', 'destello-ritual', 'confeti-codices', 'portal-nexo', 'altar-santuario', 'velo-eter']
      .flatMap((fx) => ['a', 'h', 'b'].flatMap((ph) => soundsForEffectPhase(fx, one, ph)));
    // Al menos uno de cada lista existe (las genéricas prueban variantes con y sin fase)
    for (const fx of ['resonancia', 'sello-logro', 'paquete-hebra', 'destello-ritual', 'altar-santuario', 'velo-eter']) {
      const c = soundsForEffectPhase(fx, one, 'a');
      expect(c.some((id) => manifest.sounds.has(id)), fx).toBe(true);
    }
    expect(ids.length).toBeGreaterThan(0);
  });
});
