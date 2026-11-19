import { describe, expect, it, vi } from 'vitest';
import type { AdminApi } from '../api';
import { VouchersHttp, compactRewards, describeRewards, emptyRewards, hasRewards, type Voucher } from './vouchers-http';

const voucher = (i: number): Voucher => ({
  id: `v-${i}`,
  code: `CODE-000${i}`,
  rewards: { coins: 10 },
  maxUses: 1,
  usedCount: 0,
  expiresAt: null,
  revokedAt: null,
  note: null,
  createdAt: '2026-11-19T00:00:00.000Z',
  createdBy: null,
  status: 'active',
});

type FakeApi = Pick<AdminApi, 'request'> & { request: ReturnType<typeof vi.fn> };

function fakeApi(handler: (path: string, init?: RequestInit) => unknown): FakeApi {
  return { request: vi.fn(async (path: string, init?: RequestInit) => handler(path, init)) } as unknown as FakeApi;
}

describe('helpers de recompensas', () => {
  it('compactRewards quita lo vacío', () => {
    expect(compactRewards({ ...emptyRewards(), coins: 5, chests: [{ type: 'gold', qty: 0 }] })).toEqual({ coins: 5 });
    expect(hasRewards(emptyRewards())).toBe(false);
    expect(hasRewards({ ...emptyRewards(), accessories: ['capa'] })).toBe(true);
  });

  it('describeRewards resume el paquete', () => {
    expect(describeRewards({ coins: 500, proDays: 7, chests: [{ type: 'gold', qty: 2 }], accessories: ['capa'] }, () => 'Capa')).toBe(
      '500 monedas · 7 días Pro · 2 cofres de Oro · Capa',
    );
    expect(describeRewards({})).toBe('—');
  });
});

describe('VouchersHttp', () => {
  it('recorre todas las páginas del listado', async () => {
    const first = Array.from({ length: 100 }, (_, i) => voucher(i));
    const api = fakeApi((path) => {
      const page = Number(new URL(path, 'http://x').searchParams.get('page'));
      return { items: page === 1 ? first : [voucher(100)], total: 101 };
    });
    expect(await new VouchersHttp(api).list()).toHaveLength(101);
    expect(api.request).toHaveBeenCalledTimes(2);
  });

  it('con código personalizado no envía count', async () => {
    const api = fakeApi(() => ({ items: [voucher(1)] }));
    await new VouchersHttp(api).create({
      code: ' NAVIDAD ',
      count: 5,
      maxUses: 100,
      expiresAt: null,
      note: '',
      rewards: { ...emptyRewards(), gems: 3 },
    });
    const [, init] = api.request.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ code: 'NAVIDAD', maxUses: 100, expiresAt: null, rewards: { gems: 3 } });
  });

  it('sin código envía count y la nota recortada', async () => {
    const api = fakeApi(() => ({ items: [] }));
    await new VouchersHttp(api).create({ code: '', count: 3, maxUses: 1, expiresAt: null, note: ' sorteo ', rewards: { ...emptyRewards(), coins: 1 } });
    expect(JSON.parse(api.request.mock.calls[0][1].body)).toEqual({ count: 3, maxUses: 1, expiresAt: null, note: 'sorteo', rewards: { coins: 1 } });
  });

  it('grant llama al endpoint del usuario', async () => {
    const api = fakeApi(() => ({ redemptionId: 'r', granted: {} }));
    await new VouchersHttp(api).grant('u/1', { ...emptyRewards(), proDays: 7 }, '');
    expect(api.request).toHaveBeenCalledWith('/v1/admin/users/u%2F1/grant', { method: 'POST', body: JSON.stringify({ rewards: { proDays: 7 } }) });
  });
});
