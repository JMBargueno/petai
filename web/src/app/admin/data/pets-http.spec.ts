import { describe, expect, it, vi } from 'vitest';
import type { AdminApi } from '../api';
import { HttpPetsRepository } from './pets-http';

const pet = (i: number, nickname = 'Chispa') => ({
  id: `pet-${i}`,
  nickname,
  speciesId: `species-${i}`,
  rarity: 'normal',
  level: 5,
  stage: 'juvenile',
  shiny: false,
  sick: false,
  createdAt: '2026-11-15T00:00:00.000Z',
  owner: {
    id: `owner-${i}`,
    email: `u${i}@petai.local`,
    displayName: i % 2 ? null : `U${i}`,
  },
});

type FakeApi = Pick<AdminApi, 'request'> & { request: ReturnType<typeof vi.fn> };

function fakeApi(pages: ReturnType<typeof pet>[][], total: number): FakeApi {
  const request = vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body)) as { nickname: string };
      return { ...pet(1), id: path.split('/').pop() ?? 'pet-1', nickname: body.nickname };
    }
    const page = Number(new URL(path, 'http://x').searchParams.get('page'));
    return { items: pages[page - 1] ?? [], total };
  });
  return { request } as unknown as FakeApi;
}

describe('HttpPetsRepository', () => {
  it('recorre todas las páginas y usa displayName ?? email como dueño', async () => {
    const first = Array.from({ length: 100 }, (_, i) => pet(i));
    const api = fakeApi([first, [pet(100)]], 101);
    const rows = await new HttpPetsRepository(api).list();
    expect(rows).toHaveLength(101);
    expect(api.request).toHaveBeenCalledTimes(2);
    expect(rows[1].owner).toBe('u1@petai.local'); // displayName null → email
    expect(rows[2].owner).toBe('U2'); // displayName presente
  });

  it('renombra solo si el apodo cambia', async () => {
    const api = fakeApi([[pet(1)]], 1);
    const repo = new HttpPetsRepository(api);
    await repo.list();

    const same = await repo.update('pet-1', { ...pet(1), nickname: 'Chispa' } as never);
    expect(same.nickname).toBe('Chispa');
    expect(api.request).toHaveBeenCalledTimes(1);

    const updated = await repo.update('pet-1', { nickname: 'Luna' });
    expect(updated.nickname).toBe('Luna');
    expect(api.request).toHaveBeenLastCalledWith('/v1/admin/pets/pet-1', {
      method: 'PATCH',
      body: JSON.stringify({ nickname: 'Luna' }),
    });
  });

  it('ignora un apodo sin cambios o vacío sin llamar al servidor', async () => {
    const api = fakeApi([[pet(1)]], 1);
    const repo = new HttpPetsRepository(api);
    await repo.list();

    await repo.update('pet-1', { nickname: '  Chispa  ' }); // trim → igual
    await repo.update('pet-1', { nickname: '' }); // vacío → sin llamada
    expect(api.request).toHaveBeenCalledTimes(1);
  });

  it('no permite crear ni borrar mascotas', async () => {
    const repo = new HttpPetsRepository(fakeApi([], 0));
    await expect(repo.create()).rejects.toThrow();
    await expect(repo.remove()).rejects.toThrow();
  });
});