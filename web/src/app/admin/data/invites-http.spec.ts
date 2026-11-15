import { describe, expect, it, vi } from 'vitest';
import type { AdminApi } from '../api';
import { InvitesHttp, type Invite } from './invites-http';

const invite = (i: number, extra: Partial<Invite> = {}): Invite => ({
  id: `inv-${i}`,
  code: `CODE-000${i}`,
  maxUses: 1,
  usedCount: 0,
  expiresAt: null,
  revokedAt: null,
  note: null,
  createdAt: '2026-11-15T00:00:00.000Z',
  createdBy: null,
  status: 'active',
  ...extra,
});

type FakeApi = Pick<AdminApi, 'request'> & { request: ReturnType<typeof vi.fn> };

function fakeApi(handler: (path: string, init?: RequestInit) => unknown): FakeApi {
  return { request: vi.fn(async (path: string, init?: RequestInit) => handler(path, init)) } as unknown as FakeApi;
}

describe('InvitesHttp', () => {
  it('recorre todas las páginas del listado', async () => {
    const first = Array.from({ length: 100 }, (_, i) => invite(i));
    const api = fakeApi((path) => {
      const page = Number(new URL(path, 'http://x').searchParams.get('page'));
      return { items: page === 1 ? first : [invite(100)], total: 101 };
    });
    const rows = await new InvitesHttp(api).list();
    expect(rows).toHaveLength(101);
    expect(api.request).toHaveBeenCalledTimes(2);
  });

  it('genera códigos enviando solo la nota si no está vacía, y lo audita', async () => {
    const api = fakeApi(() => ({ items: [invite(1), invite(2)] }));
    const audit = { record: vi.fn() };
    const repo = new InvitesHttp(api, audit);

    const items = await repo.create({ count: 2, maxUses: 3, expiresAt: null, note: '   ' });
    expect(items).toHaveLength(2);
    const [path, init] = api.request.mock.calls[0];
    expect(path).toBe('/v1/admin/invites');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ count: 2, maxUses: 3, expiresAt: null });
    expect(audit.record).toHaveBeenCalledWith('Alta', 'invitaciones', expect.stringContaining('2 código'));

    await repo.create({ count: 1, maxUses: 1, expiresAt: '2027-01-01T00:00:00.000Z', note: ' beta ' });
    expect(JSON.parse(api.request.mock.calls[1][1].body)).toEqual({ count: 1, maxUses: 1, expiresAt: '2027-01-01T00:00:00.000Z', note: 'beta' });
  });

  it('revoca con POST /revoke', async () => {
    const api = fakeApi(() => invite(7, { status: 'revoked', revokedAt: '2026-11-15T01:00:00.000Z' }));
    const revoked = await new InvitesHttp(api).revoke('inv-7');
    expect(revoked.status).toBe('revoked');
    expect(api.request).toHaveBeenCalledWith('/v1/admin/invites/inv-7/revoke', { method: 'POST' });
  });

  it('lee y cambia el ajuste de registro solo con invitación', async () => {
    const api = fakeApi((_path, init) => (init?.method === 'PATCH' ? JSON.parse(String(init.body)) : { inviteOnly: false }));
    const repo = new InvitesHttp(api);
    await expect(repo.inviteOnly()).resolves.toBe(false);
    await expect(repo.setInviteOnly(true)).resolves.toBe(true);
    expect(api.request).toHaveBeenLastCalledWith('/v1/admin/registration-settings', { method: 'PATCH', body: '{"inviteOnly":true}' });
  });
});
