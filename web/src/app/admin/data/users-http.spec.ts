import { describe, expect, it, vi } from 'vitest';
import type { AdminApi } from '../api';
import { HttpUsersRepository } from './users-http';

const user = (i: number, role = 'user') => ({
  id: `id-${i}`,
  email: `u${i}@petai.local`,
  displayName: i % 2 ? null : `U${i}`,
  role,
  coins: 100,
  gems: 5,
  accountXp: 0,
  createdAt: '2026-11-15T00:00:00.000Z',
});

type FakeApi = Pick<AdminApi, 'request'> & { request: ReturnType<typeof vi.fn> };

function fakeApi(pages: ReturnType<typeof user>[][], total: number): FakeApi {
  const request = vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') return { ...user(1), ...JSON.parse(String(init.body)) };
    const page = Number(new URL(path, 'http://x').searchParams.get('page'));
    return { items: pages[page - 1] ?? [], total };
  });
  return { request } as unknown as FakeApi;
}

describe('HttpUsersRepository', () => {
  it('recorre todas las páginas y normaliza displayName', async () => {
    const first = Array.from({ length: 100 }, (_, i) => user(i));
    const api = fakeApi([first, [user(100)]], 101);
    const rows = await new HttpUsersRepository(api).list();
    expect(rows).toHaveLength(101);
    expect(api.request).toHaveBeenCalledTimes(2);
    expect(rows[1].displayName).toBe('');
  });

  it('solo llama al servidor si cambia el rol', async () => {
    const api = fakeApi([[user(1)]], 1);
    const repo = new HttpUsersRepository(api);
    await repo.list();

    const same = await repo.update('id-1', { ...user(1), displayName: '' } as never);
    expect(same.role).toBe('user');
    expect(api.request).toHaveBeenCalledTimes(1);

    const updated = await repo.update('id-1', { role: 'moderator' });
    expect(updated.role).toBe('moderator');
    expect(api.request).toHaveBeenLastCalledWith('/v1/admin/users/id-1/role', {
      method: 'PATCH',
      body: JSON.stringify({ role: 'moderator' }),
    });
  });

  it('fija monedas y gemas solo con los campos modificados', async () => {
    const api = fakeApi([[user(1)]], 1);
    const repo = new HttpUsersRepository(api);
    await repo.list();

    const updated = await repo.update('id-1', { coins: 900, gems: 5 });
    expect(updated.coins).toBe(900);
    expect(api.request).toHaveBeenLastCalledWith('/v1/admin/users/id-1/balance', {
      method: 'PATCH',
      body: JSON.stringify({ coins: 900 }),
    });

    const calls = api.request.mock.calls.length;
    await repo.update('id-1', { coins: 900, gems: 5 });
    expect(api.request.mock.calls.length).toBe(calls);
  });

  it('cambia rol y saldo en dos llamadas cuando ambos cambian', async () => {
    const api = fakeApi([[user(1)]], 1);
    const repo = new HttpUsersRepository(api);
    await repo.list();

    const updated = await repo.update('id-1', { role: 'moderator', gems: 50 });
    expect(updated.gems).toBe(50);
    expect(api.request).toHaveBeenCalledTimes(3);
  });

  it('no permite crear ni borrar cuentas', async () => {
    const repo = new HttpUsersRepository(fakeApi([], 0));
    await expect(repo.create()).rejects.toThrow();
    await expect(repo.remove()).rejects.toThrow();
  });
});
