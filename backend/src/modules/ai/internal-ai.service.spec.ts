import { KeyCryptoService } from './key-crypto.service';
import { InternalAiService } from './internal-ai.service';
import { LlmProvider } from './llm-provider';

const MASTER = 'a'.repeat(64);

function build(opts: { insecure?: boolean; testImpl?: () => Promise<void> } = {}) {
  let row: any = null;
  const prisma: any = {
    internalAiConnection: {
      findUnique: jest.fn(async () => row),
      upsert: jest.fn(async ({ create, update }: any) => (row = row ? { ...row, ...update, updatedAt: new Date() } : { ...create, updatedAt: new Date() })),
      deleteMany: jest.fn(async () => {
        row = null;
        return { count: 1 };
      }),
    },
  };
  const config = { get: jest.fn((k: string) => (k === 'AI_KEY_ENCRYPTION_KEY' ? MASTER : k === 'AI_ALLOW_INSECURE_URLS' ? (opts.insecure ? 'true' : 'false') : undefined)) };
  const crypto = new KeyCryptoService(config as any);
  const created: Array<{ baseUrl: string; apiKey: string | null; addresses: string[]; jsonMode: boolean }> = [];
  class TestService extends InternalAiService {
    protected createProvider(baseUrl: string, apiKey: string | null, addresses: string[], jsonMode: boolean): LlmProvider {
      created.push({ baseUrl, apiKey, addresses, jsonMode });
      return { chat: async function* () {}, test: opts.testImpl ?? (async () => undefined) } as LlmProvider;
    }
  }
  return { svc: new TestService(prisma, crypto, config as any), prisma, created, getRow: () => row };
}

// IP pública literal: la validación no necesita DNS
const PUBLIC = 'https://93.184.216.34/v1';

describe('InternalAiService', () => {
  it('sin conexión guardada no hay nada que resolver', async () => {
    const { svc } = build();
    expect(await svc.getView()).toMatchObject({ configured: false, enabled: false, hasKey: false, keyMask: null });
    expect(await svc.resolve()).toBeNull();
    await expect(svc.test()).rejects.toThrow('Aún no hay una conexión');
  });

  it('guarda la clave cifrada y solo devuelve una máscara', async () => {
    const { svc, getRow } = build();
    const view = await svc.save({ baseUrl: `${PUBLIC}/`, model: ' mi-modelo ', apiKey: 'sk-interna-1234567890' }, 'admin-1');
    expect(view).toMatchObject({ configured: true, enabled: true, baseUrl: PUBLIC, model: 'mi-modelo', hasKey: true, keyMask: 'sk-…7890', jsonMode: true, updatedById: 'admin-1' });
    expect(JSON.stringify(view)).not.toContain('sk-interna-1234567890');
    expect(getRow().encryptedKey).toBeTruthy();
    expect(getRow().encryptedKey).not.toContain('sk-interna');
  });

  it('resuelve un proveedor con la clave descifrada, fijado a la IP comprobada', async () => {
    const { svc, created } = build();
    await svc.save({ baseUrl: PUBLIC, model: 'mi-modelo', apiKey: 'sk-interna-1234567890', jsonMode: false }, 'admin-1');
    const conn = await svc.resolve();
    expect(conn).toMatchObject({ model: 'mi-modelo', jsonMode: false });
    expect(created[0]).toEqual({ baseUrl: PUBLIC, apiKey: 'sk-interna-1234567890', addresses: ['93.184.216.34'], jsonMode: false });
  });

  it('guardar sin apiKey conserva la clave; con cadena vacía la borra', async () => {
    const { svc, created } = build();
    await svc.save({ baseUrl: PUBLIC, model: 'a', apiKey: 'sk-interna-1234567890' }, 'u');
    expect((await svc.save({ baseUrl: PUBLIC, model: 'b' }, 'u')).hasKey).toBe(true);
    await svc.resolve();
    expect(created[0].apiKey).toBe('sk-interna-1234567890');

    const cleared = await svc.save({ baseUrl: PUBLIC, model: 'b', apiKey: '' }, 'u');
    expect(cleared).toMatchObject({ hasKey: false, keyMask: null });
    await svc.resolve();
    expect(created[1].apiKey).toBeNull();
  });

  it('desactivada o quitada deja de resolverse, y el cambio se nota al momento', async () => {
    const { svc } = build();
    await svc.save({ baseUrl: PUBLIC, model: 'a' }, 'u');
    expect(await svc.resolve()).not.toBeNull();
    await svc.save({ baseUrl: PUBLIC, model: 'a', enabled: false }, 'u');
    expect(await svc.resolve()).toBeNull();
    await svc.save({ baseUrl: PUBLIC, model: 'a', enabled: true }, 'u');
    expect(await svc.resolve()).not.toBeNull();
    expect(await svc.remove()).toMatchObject({ configured: false });
    expect(await svc.resolve()).toBeNull();
  });

  it('por defecto rechaza http, redes privadas y credenciales en la URL', async () => {
    const { svc } = build();
    for (const baseUrl of ['http://93.184.216.34/v1', 'https://10.0.0.5/v1', 'https://127.0.0.1/v1', 'https://169.254.169.254/v1', 'https://u:p@93.184.216.34/v1', 'no-es-url']) {
      await expect(svc.save({ baseUrl, model: 'a' }, 'u')).rejects.toThrow();
    }
  });

  it('con red privada permitida admite un servidor interno por http, pero nunca el enlace local', async () => {
    const { svc, created } = build();
    const view = await svc.save({ baseUrl: 'http://10.0.0.5:8000/v1', model: 'local', allowPrivateNetwork: true }, 'u');
    expect(view).toMatchObject({ baseUrl: 'http://10.0.0.5:8000/v1', allowPrivateNetwork: true, hasKey: false });
    expect(await svc.resolve()).not.toBeNull();
    expect(created[0]).toMatchObject({ baseUrl: 'http://10.0.0.5:8000/v1', apiKey: null });
    for (const baseUrl of ['http://169.254.169.254/latest', 'http://[fe80::1]/v1']) {
      await expect(svc.save({ baseUrl, model: 'a', allowPrivateNetwork: true }, 'u')).rejects.toThrow('enlace local');
    }
  });

  it('una conexión guardada que deja de ser válida no rompe a quien la usa', async () => {
    const { svc, getRow } = build();
    await svc.save({ baseUrl: PUBLIC, model: 'a', apiKey: 'sk-interna-1234567890' }, 'u');
    getRow().keyTag = Buffer.from('manipulada-0123!').toString('base64');
    await svc.save({ baseUrl: PUBLIC, model: 'a' }, 'u'); // vacía la caché sin tocar la clave
    getRow().keyTag = Buffer.from('manipulada-0123!').toString('base64');
    expect(await svc.resolve()).toBeNull();
  });

  it('test: avisa con un motivo legible si el servidor no responde', async () => {
    const ok = build();
    await ok.svc.save({ baseUrl: PUBLIC, model: 'mi-modelo' }, 'u');
    expect(await ok.svc.test()).toEqual({ ok: true, model: 'mi-modelo' });

    const bad = build({ testImpl: async () => Promise.reject(new Error('API key inválida (401)')) });
    await bad.svc.save({ baseUrl: PUBLIC, model: 'mi-modelo' }, 'u');
    await expect(bad.svc.test()).rejects.toThrow('La IA interna no respondió: API key inválida (401)');
  });
});
