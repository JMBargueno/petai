import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { KeyCryptoService } from './key-crypto.service';
import { assertSafeBaseUrl, resolveSafeBaseUrl } from './ssrf';
import { pinnedFetch } from './pinned-fetch';
import { LlmProvider } from './llm-provider';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';
import { BillingConfigService } from '../billing/billing-config.service';

const PROVIDERS = ['openai', 'hermes', 'custom'] as const;
type ProviderId = (typeof PROVIDERS)[number];

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini';
const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

export interface AiConfigInput {
  mode?: 'byok' | 'managed';
  provider?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}

@Injectable()
export class AiConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: KeyCryptoService,
    private readonly config: ConfigService,
    private readonly billingConfig: BillingConfigService,
  ) {}

  private get allowInsecure() {
    return this.config.get<string>('AI_ALLOW_INSECURE_URLS') === 'true';
  }

  /** Vista segura para el cliente: la key nunca se devuelve, solo una máscara. */
  async getView(userId: string) {
    const cfg = await this.prisma.aiConfig.findUnique({ where: { userId } });
    if (!cfg || cfg.mode === 'managed') {
      const managedSettings = this.billingConfig.managedAiSettings();
      return {
        configured: true,
        mode: 'managed',
        provider: 'pockai',
        baseUrl: null,
        model: managedSettings.primaryModel,
        hasKey: false,
        keyMask: null,
        lastTestedAt: cfg?.lastTestedAt ?? null,
      };
    }
    let keyMask: string | null = null;
    if (cfg.encryptedKey && cfg.keyIv && cfg.keyTag) {
      try {
        keyMask = KeyCryptoService.mask(
          this.crypto.decrypt({ encryptedKey: cfg.encryptedKey, keyIv: cfg.keyIv, keyTag: cfg.keyTag }, userId),
        );
      } catch {
        keyMask = null; // clave maestra rotada o dato corrupto: el usuario deberá volver a guardarla
      }
    }
    return {
      configured: true,
      mode: cfg.mode,
      provider: cfg.provider,
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      hasKey: !!cfg.encryptedKey,
      keyMask,
      lastTestedAt: cfg.lastTestedAt,
    };
  }

  async upsert(userId: string, input: AiConfigInput | undefined) {
    const body = input ?? {};
    if (body.mode === 'managed') {
      await this.prisma.aiConfig.upsert({
        where: { userId },
        create: { userId, mode: 'managed', provider: 'pockai' },
        update: {
          mode: 'managed',
          provider: 'pockai',
          encryptedKey: null,
          keyIv: null,
          keyTag: null,
          baseUrl: null,
          model: null,
          lastTestedAt: null,
        },
      });
      return this.getView(userId);
    }

    const provider = (body.provider ?? 'openai') as ProviderId;
    if (!PROVIDERS.includes(provider)) {
      throw new BadRequestException(`Proveedor no soportado. Usa: ${PROVIDERS.join(', ')}`);
    }

    const existing = await this.prisma.aiConfig.findUnique({ where: { userId } });

    let baseUrl = body.baseUrl?.trim() || (provider === 'openai' ? OPENAI_BASE_URL : existing?.baseUrl || '');
    if (!baseUrl) {
      throw new BadRequestException('baseUrl es obligatoria para este proveedor');
    }
    // Tolerancia: si el usuario pegó la URL de completions completa, se extrae la URL base
    baseUrl = baseUrl.replace(/\/chat\/completions\/?$/i, '').replace(/\/+$/, '');
    baseUrl = await assertSafeBaseUrl(baseUrl, { allowInsecure: this.allowInsecure });

    const model = body.model?.trim() || existing?.model || (provider === 'openai' ? OPENAI_DEFAULT_MODEL : '');
    if (!model) {
      throw new BadRequestException('model es obligatorio para este proveedor');
    }
    if (model.length > 100) throw new BadRequestException('model demasiado largo');

    let secret: { encryptedKey: string; keyIv: string; keyTag: string } | undefined;
    if (body.apiKey !== undefined) {
      const key = body.apiKey.trim();
      if (key.length < 4 || key.length > 512 || /[\s\u0000-\u001f]/.test(key)) {
        throw new BadRequestException('La API key no es válida');
      }
      secret = this.crypto.encrypt(key, userId);
    } else if (!existing?.encryptedKey) {
      throw new BadRequestException('apiKey es obligatoria la primera vez');
    }

    await this.prisma.aiConfig.upsert({
      where: { userId },
      create: { userId, mode: 'byok', provider, baseUrl, model, ...secret },
      // Al cambiar de endpoint/modelo se invalida la última comprobación
      update: { mode: 'byok', provider, baseUrl, model, lastTestedAt: null, ...secret },
    });
    return this.getView(userId);
  }

  async remove(userId: string) {
    await this.prisma.aiConfig.deleteMany({ where: { userId } });
    return this.getView(userId);
  }

  /** Prepara el proveedor del usuario (descifra la key solo en memoria o usa OpenRouter en modo managed). */
  async resolveProvider(userId: string): Promise<{ provider: LlmProvider; model: string; mode: string }> {
    const cfg = await this.prisma.aiConfig.findUnique({ where: { userId } });

    // Sin config o mode=managed -> Rama MANAGED (IA de Pockai, OpenRouter con key del servidor)
    if (!cfg || cfg.mode === 'managed') {
      const managedSettings = this.billingConfig.managedAiSettings();
      const apiKey = this.config.get<string>('OPENROUTER_API_KEY') || 'mock-openrouter-key';
      const provider = new OpenAiCompatibleProvider(
        OPENROUTER_DEFAULT_BASE_URL,
        apiKey,
        fetch,
        {
          extraHeaders: { 'HTTP-Referer': 'https://pockai.app', 'X-Title': 'Pockai' },
          // `usage.include`: OpenRouter devuelve el coste real en el último chunk (presupuesto exacto)
          extraBody: { models: managedSettings.fallbackModels, usage: { include: true } },
          firstTokenTimeoutMs: (managedSettings.firstTokenTimeoutSeconds ?? 10) * 1000,
        },
      );
      return { provider, model: managedSettings.primaryModel, mode: 'managed' };
    }

    // Rama BYOK
    if (!cfg.encryptedKey || !cfg.keyIv || !cfg.keyTag || !cfg.baseUrl || !cfg.model) {
      throw new NotFoundException('Configura primero tu proveedor de IA');
    }
    // Se revalida en cada uso: la URL pudo cambiar de destino (DNS) desde que se guardó
    const { url, addresses } = await resolveSafeBaseUrl(cfg.baseUrl, { allowInsecure: this.allowInsecure });
    const stored = { encryptedKey: cfg.encryptedKey, keyIv: cfg.keyIv, keyTag: cfg.keyTag };
    const key = this.crypto.decrypt(stored, userId);
    // Keys guardadas antes de ligar el cifrado al usuario: se vuelven a cifrar ligadas la primera vez que se usan
    if (!KeyCryptoService.isBound(stored)) {
      await this.prisma.aiConfig
        .updateMany({ where: { userId, encryptedKey: cfg.encryptedKey }, data: this.crypto.encrypt(key, userId) })
        .catch(() => undefined);
    }
    return { provider: this.createProvider(url, key, addresses), model: cfg.model, mode: cfg.mode };
  }

  /**
   * Punto de extensión (y de sustitución en tests). `addresses` son las IP que pasaron la comprobación
   * SSRF: la conexión se fija a ellas para que una segunda resolución DNS no pueda desviarla.
   */
  protected createProvider(baseUrl: string, apiKey: string, addresses: string[] = []): LlmProvider {
    return new OpenAiCompatibleProvider(baseUrl, apiKey, addresses.length > 0 ? pinnedFetch(addresses) : fetch);
  }

  async test(userId: string) {
    const { provider, model, mode } = await this.resolveProvider(userId);
    // La IA gestionada no se "prueba": sería una llamada gratis con la key del servidor, fuera de
    // cuota y presupuesto (y el usuario no tiene nada que validar).
    if (mode === 'managed') {
      return { ok: true, mode: 'managed' };
    }
    try {
      await provider.test(model);
    } catch (err: any) {
      return { ok: false, error: err?.message || 'No se pudo conectar con el proveedor' };
    }
    await this.prisma.aiConfig.update({ where: { userId }, data: { lastTestedAt: new Date() } });
    return { ok: true };
  }
}
