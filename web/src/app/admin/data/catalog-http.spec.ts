import { describe, expect, it, vi } from 'vitest';
import type { AdminApi } from '../api';
import { HttpEventsRepository, HttpItemsRepository, HttpPetsRepository, MAX_PETS } from './catalog-http';

type FakeApi = Pick<AdminApi, 'request'> & { request: ReturnType<typeof vi.fn> };

function fakeApi(handler: (path: string, init?: RequestInit) => unknown): FakeApi {
  return { request: vi.fn(async (path: string, init?: RequestInit) => handler(path, init)) } as unknown as FakeApi;
}

const apple = { id: 'apple', kind: 'food', name: 'Manzana', description: '', priceCoins: 10, priceGems: 0 };

describe('HttpItemsRepository', () => {
  it('solo envía los precios al servidor', async () => {
    const api = fakeApi((_, init) => ({ ...apple, ...JSON.parse(String(init?.body)) }));
    const repo = new HttpItemsRepository(api);

    const updated = await repo.update('apple', { priceCoins: 12, name: 'Otro' } as never);
    expect(updated.priceCoins).toBe(12);
    expect(api.request).toHaveBeenCalledWith('/v1/admin/items/apple', { method: 'PATCH', body: JSON.stringify({ priceCoins: 12 }) });

    await expect(repo.update('apple', { name: 'x' })).rejects.toThrow('Solo se pueden cambiar los precios');
  });

  it('el ajuste en bloque es una sola petición', async () => {
    const api = fakeApi(() => ({ items: [apple], changed: 1 }));
    const res = await new HttpItemsRepository(api).bulkAdjust(['apple', 'pear'], -10, 'priceGems');
    expect(res.changed).toBe(1);
    expect(api.request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(api.request.mock.calls[0][1].body)).toEqual({ ids: ['apple', 'pear'], percent: -10, currency: 'priceGems' });
  });

  it('no crea ni borra objetos', async () => {
    const repo = new HttpItemsRepository(fakeApi(() => null));
    await expect(repo.create()).rejects.toThrow();
    await expect(repo.remove()).rejects.toThrow();
  });
});

describe('repositorios de solo lectura', () => {
  it('eventos: lista y rechaza cambios sin llamar al servidor', async () => {
    const api = fakeApi(() => [{ id: 'festival:x' }]);
    const repo = new HttpEventsRepository(api);
    expect(await repo.list()).toEqual([{ id: 'festival:x' }]);
    await expect(repo.update()).rejects.toThrow('solo lectura');
    expect(api.request).toHaveBeenCalledTimes(1);
  });

  it('mascotas: pagina hasta el tope', async () => {
    const pet = (i: number) => ({ id: `p${i}` });
    const api = fakeApi((path) => {
      const page = Number(new URL(path, 'http://x').searchParams.get('page'));
      return { items: Array.from({ length: 100 }, (_, i) => pet(page * 100 + i)), total: 5000 };
    });
    const rows = await new HttpPetsRepository(api).list();
    expect(rows).toHaveLength(MAX_PETS);
    expect(api.request).toHaveBeenCalledTimes(MAX_PETS / 100);
  });

  it('mascotas: para en la última página', async () => {
    const api = fakeApi(() => ({ items: [{ id: 'p1' }, { id: 'p2' }], total: 2 }));
    expect(await new HttpPetsRepository(api).list()).toHaveLength(2);
    expect(api.request).toHaveBeenCalledTimes(1);
  });
});
