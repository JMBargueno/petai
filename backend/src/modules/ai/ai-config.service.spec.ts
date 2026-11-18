import { AiConfigService } from './ai-config.service';

describe('AiConfigService (Spec-34 Managed AI)', () => {
  let prisma: any;
  let crypto: any;
  let config: any;
  let billingConfig: any;
  let svc: AiConfigService;

  beforeEach(() => {
    prisma = {
      aiConfig: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    crypto = {
      encrypt: jest.fn(() => ({ encryptedKey: 'enc', keyIv: 'iv', keyTag: 'tag' })),
      decrypt: jest.fn(() => 'sk-user-key'),
    };
    config = {
      get: jest.fn((k: string) => {
        if (k === 'OPENROUTER_API_KEY') return 'sk-or-test-key';
        return undefined;
      }),
    };
    billingConfig = {
      managedAiSettings: jest.fn(() => ({
        enabled: true,
        primaryModel: 'google/gemini-2.5-flash-lite',
        fallbackModels: ['meta-llama/llama-3.3-70b-instruct'],
      })),
    };
    svc = new AiConfigService(prisma, crypto, config, billingConfig);
  });

  describe('resolveProvider', () => {
    it('resuelve automáticamente a managed con OpenRouter cuando no hay config previa (AC1)', async () => {
      prisma.aiConfig.findUnique.mockResolvedValue(null);

      const resolved = await svc.resolveProvider('user-new');

      expect(resolved.mode).toBe('managed');
      expect(resolved.model).toBe('google/gemini-2.5-flash-lite');
      expect(resolved.provider).toBeDefined();
    });

    it('resuelve a managed si mode === managed explícitamente', async () => {
      prisma.aiConfig.findUnique.mockResolvedValue({
        userId: 'user-1',
        mode: 'managed',
      });

      const resolved = await svc.resolveProvider('user-1');

      expect(resolved.mode).toBe('managed');
      expect(resolved.model).toBe('google/gemini-2.5-flash-lite');
    });
  });

  describe('getView', () => {
    it('devuelve mode: managed y provider: pockai para usuario nuevo', async () => {
      prisma.aiConfig.findUnique.mockResolvedValue(null);

      const view = await svc.getView('user-new');

      expect(view.configured).toBe(true);
      expect(view.mode).toBe('managed');
      expect(view.provider).toBe('pockai');
      expect(view.hasKey).toBe(false);
    });
  });

  describe('upsert', () => {
    it('permite cambiar a modo managed y borra las claves almacenadas', async () => {
      await svc.upsert('user-1', { mode: 'managed' });

      expect(prisma.aiConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          create: expect.objectContaining({ mode: 'managed', provider: 'pockai' }),
          update: expect.objectContaining({ mode: 'managed', encryptedKey: null }),
        }),
      );
    });
  });

  describe('test', () => {
    it('en modo managed no llama al proveedor con la key del servidor ni toca la BD', async () => {
      prisma.aiConfig.findUnique.mockResolvedValue(null);
      prisma.aiConfig.update = jest.fn();
      const fetchSpy = jest.spyOn(globalThis, 'fetch' as any);

      await expect(svc.test('user-new')).resolves.toEqual({ ok: true, mode: 'managed' });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(prisma.aiConfig.update).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });
});
