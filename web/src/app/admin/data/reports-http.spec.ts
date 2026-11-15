import { describe, expect, it, vi } from 'vitest';
import type { AdminApi } from '../api';
import { describeAudit } from '../features/audit';
import type { AuditEntry } from './models';
import { ReportsHttp } from './reports-http';

describe('ReportsHttp', () => {
  it('pide el registro paginado y con filtro de evento opcional', async () => {
    const request = vi.fn(async () => ({ items: [], total: 0, page: 2, pageSize: 10 }));
    const reports = new ReportsHttp({ request } as unknown as Pick<AdminApi, 'request'>);

    await reports.audit(2, 10, 'role_change');
    await reports.audit();
    expect(request.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      '/v1/admin/audit?page=2&pageSize=10&event=role_change',
      '/v1/admin/audit?page=1&pageSize=50',
    ]);
  });
});

describe('describeAudit', () => {
  const entry = (event: string, metadata: Record<string, unknown>): AuditEntry => ({
    id: '1',
    userId: 'u1',
    userEmail: null,
    event,
    ip: null,
    metadata,
    createdAt: '2026-11-15T00:00:00.000Z',
  });

  it('resume los cambios más comunes', () => {
    expect(describeAudit(entry('role_change', { from: 'user', to: 'moderator' }))).toBe('user → moderator');
    expect(describeAudit(entry('item_price_change', { itemId: 'apple', from: { priceCoins: 10 }, to: { priceCoins: 12 } }))).toBe(
      'apple: monedas 10 → 12',
    );
    expect(describeAudit(entry('item_price_bulk', { percent: -10, currency: 'priceGems', changes: [{}, {}] }))).toBe(
      '-10 % en gemas · 2 ítems',
    );
    expect(describeAudit(entry('login', {}))).toBe('');
  });
});
