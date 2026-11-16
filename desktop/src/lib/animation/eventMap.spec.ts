import { describe, expect, it } from 'vitest';
import { LOCAL_ACTIONS, ReactionDeduper, reactionForAction } from './eventMap';
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
