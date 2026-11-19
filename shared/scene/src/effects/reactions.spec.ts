import { describe, expect, it } from 'vitest';
import { ACTIONS_WITH_EFFECT, EFFECTS, effectForPetAction } from './index';

describe('effectForPetAction (tabla compartida escritorio / escena)', () => {
  it('cada acción con efecto apunta a un efecto registrado', () => {
    for (const action of ACTIONS_WITH_EFFECT) {
      // Contexto que activa el efecto en las acciones que lo piden (misiones: el día completo)
      const req = effectForPetAction(action, { dailyCompleted: true });
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

  it('lo que entrega el Éter (voucher o regalo del equipo) es un sello del color de lo recibido; el regalo de un amigo, el paquete', () => {
    expect(effectForPetAction('gift_received', { source: 'voucher', reward: 'gems' })).toEqual({ id: 'sello-eter', params: { reward: 'gems' } });
    expect(effectForPetAction('gift_received', { source: 'admin_grant', reward: 'chest', tier: 'gold' })).toEqual({
      id: 'sello-eter',
      params: { reward: 'chest', tier: 'gold' },
    });
    // El tier solo acompaña al cofre; sin tipo, monedas
    expect(effectForPetAction('gift_received', { source: 'voucher', reward: 'pro', tier: 'gold' })?.params).toEqual({ reward: 'pro' });
    expect(effectForPetAction('gift_received', { source: 'admin_grant' })?.params).toEqual({ reward: 'coins' });
    expect(effectForPetAction('gift_received', { source: 'friend' })).toEqual({ id: 'paquete-hebra', params: { kind: 'gift' } });
    expect(effectForPetAction('gift_received')).toEqual({ id: 'paquete-hebra', params: { kind: 'gift' } });
  });

  it('los momentos sin efecto propio devuelven null', () => {
    expect(effectForPetAction('fed', {})).toBeNull();
    expect(effectForPetAction('accion_inventada')).toBeNull();
  });
});
