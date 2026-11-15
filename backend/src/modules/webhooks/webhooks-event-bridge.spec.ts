import { Test } from '@nestjs/testing';
import { WebhooksEventBridge } from './webhooks-event-bridge';
import { WEBHOOKS_QUEUE } from '../../queues/queue.constants';

/**
 * WebhooksEventBridge — unidad (R-01: ahora encola en BullMQ, no despacha inline).
 *
 * Mapea los eventos reales de dominio (convención `pet:*`) al nombre de webhook y encola
 * `queue.add('webhook', payload)` fire-and-forget: no retiene la petición ni el dominio.
 *
 * Nota: no importamos `getQueueToken` de `@nestjs/bullmq` (ESM-only, incompatible con Jest
 * CommonJS). El token de inyección que usa `@InjectQueue(name)` es `BULLMQ_QUEUE_${name}`.
 */
describe('WebhooksEventBridge', () => {
  let bridge: WebhooksEventBridge;
  let queueAdd: jest.Mock;
  const queueToken = `BullQueue_${WEBHOOKS_QUEUE}`;

  beforeEach(async () => {
    queueAdd = jest.fn().mockResolvedValue(undefined);
    const mod = await Test.createTestingModule({
      providers: [
        WebhooksEventBridge,
        { provide: queueToken, useValue: { add: queueAdd } },
      ],
    }).compile();
    bridge = mod.get(WebhooksEventBridge);
  });

  it('pet:evolved → encola pet.evolved con userId+petId', () => {
    bridge.onPetEvolved({ userId: 'u1', petId: 'p1' });
    expect(queueAdd).toHaveBeenCalledWith(
      'webhook',
      { event: 'pet.evolved', userId: 'u1', petId: 'p1' },
      expect.objectContaining({ attempts: 3 }),
    );
  });

  it('pet:battle-won / pet:battle-lost → encolan combat.finished', () => {
    bridge.onBattleWon({ userId: 'u1', petId: 'p1', won: true });
    expect(queueAdd).toHaveBeenCalledWith(
      'webhook',
      { event: 'combat.finished', userId: 'u1', petId: 'p1' },
      expect.objectContaining({ attempts: 3 }),
    );
    bridge.onBattleLost({ userId: 'u2', petId: 'p2', won: false });
    expect(queueAdd).toHaveBeenCalledWith(
      'webhook',
      { event: 'combat.finished', userId: 'u2', petId: 'p2' },
      expect.objectContaining({ attempts: 3 }),
    );
  });

  it('pet:level_up → encola level.up', () => {
    bridge.onLevelUp({ userId: 'u1', petId: 'p1' });
    expect(queueAdd).toHaveBeenCalledWith(
      'webhook',
      { event: 'level.up', userId: 'u1', petId: 'p1' },
      expect.objectContaining({ attempts: 3 }),
    );
  });

  it('sin userId no encola (webhook requiere userId)', () => {
    bridge.onPetEvolved({ userId: undefined, petId: 'p1' });
    expect(queueAdd).not.toHaveBeenCalled();
  });
});

