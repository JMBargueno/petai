import { describe, expect, it } from 'vitest';
import { EMOTE_EMOJI, LOCAL_ACTIONS, ReactionDeduper, reactionForAction, reactionForBehavior } from './eventMap';
import { PET_ACTIONS, isPetActionEvent } from './petActions';
import { getAnimLibrary } from '../sprites';

describe('reactionForAction', () => {
  it('cada animación de cada reacción existe en las hojas de sprites', () => {
    const { library, aliases } = getAnimLibrary('axolunar');
    const contexts = [undefined, { won: true }, { draw: true }, { favorite: true }, { dailyCompleted: true }, { tier: 'emotional' }, { act: 'dance' }];
    for (const action of PET_ACTIONS) {
      for (const context of contexts) {
        const r = reactionForAction({ action, context });
        for (const anim of r?.anims ?? []) {
          expect(library[anim] ?? library[aliases[anim]], `${action} → ${anim}`).toBeTruthy();
        }
      }
    }
  });

  it('elige animación y bocadillo según el contexto', () => {
    expect(reactionForAction({ action: 'battle_defended', context: { won: true, attackerName: 'Ana' } })).toMatchObject({
      anims: ['hit', 'victory'],
      bubble: expect.stringContaining('Ana'),
    });
    expect(reactionForAction({ action: 'battle_defended', context: { won: false } })?.anims).toEqual(['hit', 'defeat']);
    expect(reactionForAction({ action: 'level_up', context: { level: 7 } })?.bubble).toContain('7');
    // Momentos grandes: llevan su efecto del escritorio con los datos del contexto
    expect(reactionForAction({ action: 'level_up', context: { level: 7 } })?.effect).toEqual({ id: 'resonancia', params: { level: 7 } });
    expect(reactionForAction({ action: 'evolved', context: { stage: 'adult' } })?.effect).toEqual({ id: 'capullo-telar', params: { stage: 'adult' } });
    expect(reactionForAction({ action: 'fed' })?.effect).toBeUndefined();
    expect(reactionForAction({ action: 'mood_moment', context: { act: 'cry' } })?.anims).toEqual(['cry']);
    expect(reactionForAction({ action: 'mood_moment', context: { act: 'desconocido' } })).toBeNull();
    expect(reactionForAction({ action: 'slept' })).toBeNull();
    // friend_visit: el bocadillo usa el nombre del visitante cuando el contexto lo trae
    expect(reactionForAction({ action: 'friend_visit', context: { visitorName: 'Luis' } })?.bubble).toContain('Luis');
    expect(reactionForAction({ action: 'friend_visit' })?.bubble).toContain('amigo');
  });

  it('las acciones locales apuntan a acciones válidas', () => {
    for (const a of Object.values(LOCAL_ACTIONS)) expect(PET_ACTIONS).toContain(a);
  });
});

describe('reactionForBehavior', () => {
  const ACTIONS = ['comfort', 'celebrate', 'cuddle', 'invite_play', 'propose_explore', 'greet', 'wave_goodbye', 'listen', 'ask_back', 'sulk', 'show_off', 'yawn'];
  const ANIMATIONS = ['idle', 'happy', 'sleep'];

  it('solo lanza clips de acción que terminan, en todas las especies', () => {
    for (const species of ['axolunar', 'ignisaur', 'florabud']) {
      const { library, aliases } = getAnimLibrary(species);
      for (const action of ACTIONS) {
        for (const animation of ANIMATIONS) {
          for (const anim of reactionForBehavior({ action, animation, emote: null })?.anims ?? []) {
            const clip = library[anim] ?? library[aliases[anim]];
            expect(clip, `${species}: ${action}/${animation} → ${anim}`).toBeTruthy();
            expect(clip.loop, `${species}: ${anim} no debe ser un bucle`).toBe(false);
          }
        }
      }
    }
  });

  it('traduce animación y emote', () => {
    expect(reactionForBehavior({ action: 'greet', animation: 'happy', emote: 'wave' })).toEqual({ anims: ['happy'], particle: '👋' });
    expect(reactionForBehavior({ action: 'cuddle', animation: 'happy', emote: 'heart' })).toEqual({ anims: ['love'], particle: '❤️' });
    expect(reactionForBehavior({ action: 'yawn', animation: 'sleep', emote: 'zzz' })).toEqual({ anims: ['wake'], particle: '💤' });
    expect(reactionForBehavior({ action: 'sulk', animation: 'idle', emote: 'tear' })).toEqual({ anims: [], particle: '💧' });
    for (const emote of Object.keys(EMOTE_EMOJI)) {
      expect(reactionForBehavior({ action: 'x', animation: 'idle', emote })?.particle).toBe(EMOTE_EMOJI[emote]);
    }
  });

  it('no rompe si behavior no viene o trae valores desconocidos', () => {
    expect(reactionForBehavior(undefined)).toBeNull();
    expect(reactionForBehavior(null)).toBeNull();
    expect(reactionForBehavior('happy')).toBeNull();
    expect(reactionForBehavior({ action: 'listen', animation: 'idle', emote: null })).toBeNull();
    expect(reactionForBehavior({ animation: 'bailar', emote: 'fuego' })).toBeNull();
    expect(reactionForBehavior({ animation: 'happy' })).toEqual({ anims: ['happy'] });
  });
});

describe('ReactionDeduper', () => {
  it('ignora la misma acción dentro de la ventana', () => {
    const d = new ReactionDeduper(1500);
    expect(d.shouldPlay('p1', 'fed', 1000)).toBe(true);
    expect(d.shouldPlay('p1', 'fed', 2000)).toBe(false);
    expect(d.shouldPlay('p2', 'fed', 2000)).toBe(true);
    expect(d.shouldPlay('p1', 'fed', 4000)).toBe(true);
  });
});

describe('isPetActionEvent', () => {
  it('valida la forma del evento', () => {
    expect(isPetActionEvent({ petId: 'x', action: 'fed' })).toBe(true);
    expect(isPetActionEvent({ petId: null, action: 'achievement' })).toBe(true);
    expect(isPetActionEvent({ petId: 'x', action: 'bailar' })).toBe(false);
    expect(isPetActionEvent(null)).toBe(false);
  });
});
