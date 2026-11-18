import { describe, expect, it } from 'vitest';
import { ACTIONS_WITH_EFFECT, EFFECTS, effectForPetAction } from './index';

describe('effectForPetAction (tabla compartida escritorio / escena)', () => {
  it('cada acción con efecto apunta a un efecto registrado', () => {
    for (const action of ACTIONS_WITH_EFFECT) {
      const req = effectForPetAction(action, {});
      expect(req, action).not.toBeNull();
      expect(EFFECTS[req!.id], action + ' → ' + req!.id).toBeDefined();
    }
  });

  it('pasa los datos del contexto al efecto', () => {
    expect(effectForPetAction('level_up', { level: 12 })).toEqual({ id: 'resonancia', params: { level: 12 } });
    expect(effectForPetAction('hatched', { rarity: 'mythic', shiny: true, pity: 'legendary' })).toEqual({
      id: 'revelacion-densidad',
      params: { rarity: 'mythic', shiny: 1, pity: 'legendary' },
    });
    expect(effectForPetAction('battle_defended', { draw: true })?.params).toEqual({ outcome: 'draw' });
    expect(effectForPetAction('achievement', { tier: 'epic' })?.params).toEqual({ tier: 'epic' });
  });

  it('los momentos sin efecto propio devuelven null', () => {
    expect(effectForPetAction('fed', {})).toBeNull();
    expect(effectForPetAction('accion_inventada')).toBeNull();
  });
});
