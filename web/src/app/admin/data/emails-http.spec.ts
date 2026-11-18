import { describe, expect, it, vi } from 'vitest';
import type { AdminApi } from '../api';
import { EmailsHttp, parseEmailList } from './emails-http';

type FakeApi = Pick<AdminApi, 'request'> & { request: ReturnType<typeof vi.fn> };

function fakeApi(handler: (path: string, init?: RequestInit) => unknown): FakeApi {
  return { request: vi.fn(async (path: string, init?: RequestInit) => handler(path, init)) } as unknown as FakeApi;
}

describe('parseEmailList', () => {
  it('separa por comas, espacios y saltos de línea, deduplica y valida', () => {
    expect(parseEmailList('A@x.com, b@y.org;\na@x.com  nope  c@z')).toEqual({
      valid: ['a@x.com', 'b@y.org'],
      invalid: ['nope', 'c@z'],
    });
  });
});

describe('EmailsHttp', () => {
  const content = { subject: 'Hola', html: '<p>x</p>' };

  it('pide la vista previa con el contenido', async () => {
    const api = fakeApi(() => ({ html: '<!DOCTYPE html>…' }));
    expect(await new EmailsHttp(api).preview(content)).toBe('<!DOCTYPE html>…');
    expect(api.request).toHaveBeenCalledWith('/v1/admin/emails/preview', { method: 'POST', body: JSON.stringify(content) });
  });

  it('cuenta destinatarios de un segmento', async () => {
    const api = fakeApi(() => ({ count: 42 }));
    const audience = { type: 'segment' as const, role: 'user' as const, verified: 'verified' as const };
    expect(await new EmailsHttp(api).count(audience)).toBe(42);
    expect(api.request).toHaveBeenCalledWith('/v1/admin/emails/audience/count', { method: 'POST', body: JSON.stringify({ audience }) });
  });

  it('crea el envío con contenido y destinatarios en el mismo cuerpo', async () => {
    const api = fakeApi(() => ({ id: 'c1' }));
    await new EmailsHttp(api).send(content, { type: 'emails', emails: ['a@x.com'] });
    expect(api.request).toHaveBeenCalledWith('/v1/admin/emails', {
      method: 'POST',
      body: JSON.stringify({ ...content, audience: { type: 'emails', emails: ['a@x.com'] } }),
    });
  });

  it('la búsqueda de usuarios codifica la consulta y solo devuelve id, correo y nombre', async () => {
    const api = fakeApi(() => ({ items: [{ id: 'u1', email: 'a@x.com', displayName: null, coins: 5 }], total: 1 }));
    expect(await new EmailsHttp(api).searchUsers('a b&c')).toEqual([{ id: 'u1', email: 'a@x.com', displayName: null }]);
    expect(api.request).toHaveBeenCalledWith('/v1/admin/users?page=1&pageSize=10&q=a%20b%26c');
  });
});
