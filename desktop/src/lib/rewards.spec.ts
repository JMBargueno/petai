import { get } from 'svelte/store';
import { beforeEach, describe, expect, it } from 'vitest';
import type { RewardReceived } from './api';
import { celebrateReward, resetRewardsForTest, rewardLines, rewardToCelebrate } from './rewards';

const reward = (id: string, granted: Partial<RewardReceived['granted']> = {}): RewardReceived => ({
  source: 'voucher',
  redemptionId: id,
  granted: { coins: 0, gems: 0, proDays: 0, proUntil: null, chests: [], accessories: [], ...granted },
});

describe('celebrateReward', () => {
  beforeEach(() => resetRewardsForTest());

  it('celebra cada entrega una sola vez', () => {
    expect(celebrateReward(reward('r1'))).toBe(true);
    expect(get(rewardToCelebrate)?.redemptionId).toBe('r1');
    expect(celebrateReward(reward('r1'))).toBe(false);
    expect(celebrateReward(reward('r2'))).toBe(true);
  });

  it('ignora payloads vacíos', () => {
    expect(celebrateReward(null)).toBe(false);
    expect(celebrateReward({ ...reward(''), redemptionId: '' })).toBe(false);
  });
});

describe('rewardLines', () => {
  it('desglosa el paquete en orden', () => {
    const lines = rewardLines({
      coins: 500,
      gems: 3,
      proDays: 7,
      proUntil: '2026-11-26T12:00:00.000Z',
      chests: [{ type: 'gold', qty: 2 }],
      accessories: [
        { id: 'a', name: 'Capa', alreadyOwned: false },
        { id: 'b', name: 'Gorro', alreadyOwned: true },
      ],
    });
    expect(lines.map((l) => l.kind)).toEqual(['coins', 'gems', 'pro', 'chest', 'accessory', 'accessory']);
    expect(lines[0].text).toBe('+500 monedas');
    expect(lines[2].text).toMatch(/^\+7 días de Pro \(hasta el /);
    expect(lines[3].text).toBe('2 × cofre de Oro');
    expect(lines[5].text).toBe('Gorro (ya la tenías)');
  });
});
