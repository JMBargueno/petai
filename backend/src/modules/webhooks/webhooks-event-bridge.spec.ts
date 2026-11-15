import { Test } from '@nestjs/testing';
import { WebhooksEventBridge } from './webhooks-event-bridge';
import { WebhooksService } from './webhooks.service';

/**
 * WebhooksEventBridge — unidad.
 *
 * Mapea los eventos reales de dominio (convención `pet:*`) a los nombres de webhook y dispara
 * `dispatch` fire-and-forget (no retiene la petición ni el dominio).
 */
describe('WebhooksEventBridge', () => {
  let bridge: WebhooksEventBridge;
  let dispatch: jest.Mock;

  beforeEach(async () => {
    dispatch = jest.fn().mockResolvedValue(1);
    const mod = await Test.createTestingModule({
      providers: [
        WebhooksEventBridge,
        { provide: WebhooksService, useValue: { dispatch } },
      ],
    }).compile();
    bridge = mod.get(WebhooksEventBridge);
  });

  it('pet:evolved → dispatch pet.evolved con userId+petId', () => {
    bridge.onPetEvolved({ userId: 'u1', petId: 'p1' });
    expect(dispatch).toHaveBeenCalledWith({ event: 'pet.evolved', userId: 'u1', petId: 'p1' });
  });

  it('pet:battle-won / pet:battle-lost → dispatch combat.finished', () => {
    bridge.onBattleWon({ userId: 'u1', petId: 'p1', won: true });
    expect(dispatch).toHaveBeenCalledWith({ event: 'combat.finished', userId: 'u1', petId: 'p1' });
    bridge.onBattleLost({ userId: 'u2', petId: 'p2', won: false });
    expect(dispatch).toHaveBeenCalledWith({ event: 'combat.finished', userId: 'u2', petId: 'p2' });
  });

  it('pet:level_up → dispatch level.up', () => {
    bridge.onLevelUp({ userId: 'u1', petId: 'p1' });
    expect(dispatch).toHaveBeenCalledWith({ event: 'level.up', userId: 'u1', petId: 'p1' });
  });

  it('sin userId no despacha (dispatch requiere userId)', () => {
    bridge.onPetEvolved({ userId: undefined, petId: 'p1' });
    expect(dispatch).not.toHaveBeenCalled();
  });
});
