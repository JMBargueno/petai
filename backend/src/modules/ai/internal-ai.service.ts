import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { PrismaService } from '../../prisma/prisma.service';
import { KeyCryptoService } from './key-crypto.service';
import { LlmProvider } from './llm-provider';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';
import { pinnedFetch } from './pinned-fetch';
import { resolveSafeBaseUrl } from './ssrf';

/** Fila única de la conexión. */
const ROW_ID = 'default';
/** Contexto con el que se cifra la clave: no es de ningún usuario. */
const KEY_CONTEXT = 'internal-ai';
/** Las réplicas releen la conexión como mucho cada este tiempo tras un cambio hecho en otra. */
const CACHE_MS = 30_000;

export interface InternalAiInput {
  baseUrl: string;
  model: string;
  /** Sin ella se conserva la clave guardada. Cadena vacía = sin clave (servidores locales). */
  apiKey?: string;
  jsonMode?: boolean;
  allowPrivateNetwork?: boolean;
  enabled?: boolean;
}

export interface InternalAiView {
  configured: boolean;
  enabled: boolean;
  baseUrl: string | null;
  model: string | null;
  hasKey: boolean;
  keyMask: string | null;
  jsonMode: boolean;
  allowPrivateNetwork: boolean;
  updatedAt: Date | null;
  updatedById: string | null;
}

export interface InternalAiConnection {
  provider: LlmProvider;
  model: string;
  jsonMode: boolean;
}

/** Enlace local (169.254.0.0/16, fe80::/10): ahí viven los metadatos de las nubes. Nunca se permite. */
function isLinkLocal(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, '');
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v)?.[1];
  const v4 = isIP(v) === 4 ? v : mapped;
  if (v4) return v4.startsWith('169.254.');
  return /^fe[89ab][0-9a-f]:/.test(v) || v.startsWith('::ffff:a9fe:');
}

/**
 * IA interna: la conexión propia del equipo a un endpoint compatible con la API de OpenAI (Chat
 * Completions). La usa la IA del sistema para tareas sin usuario, como tejer las historias de la
 * aventura diaria. Se configura desde el panel de administración; la clave se guarda cifrada y
 * nunca se devuelve.
 */
@Injectable()
export class InternalAiService {
  private readonly logger = new Logger(InternalAiService.name);
  private cache: { at: number; value: InternalAiConnection | null } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: KeyCryptoService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Valida la URL. Por defecto, la misma política que las claves de los usuarios (HTTPS y destino
   * público, con la conexión fijada a las IP comprobadas). Con `allowPrivateNetwork` se admite un
   * servidor en la red privada (http y rangos privados), pero nunca el enlace local.
   */
  private async checkUrl(baseUrl: string, allowPrivateNetwork: boolean): Promise<{ url: string; addresses: string[] }> {
    const insecureDev = this.config.get<string>('AI_ALLOW_INSECURE_URLS') === 'true';
    if (!allowPrivateNetwork) return resolveSafeBaseUrl(baseUrl, { allowInsecure: insecureDev });

    const { url } = await resolveSafeBaseUrl(baseUrl, { allowInsecure: true });
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(host) ? [host] : await lookup(host, { all: true }).then((r) => r.map((a) => a.address), () => [] as string[]);
    if (addresses.length === 0) throw new BadRequestException('La baseUrl no se puede resolver');
    if (addresses.some(isLinkLocal)) throw new BadRequestException('La baseUrl apunta a una dirección de enlace local; no está permitida');
    return { url, addresses: [] };
  }

  private view(row: any | null): InternalAiView {
    let keyMask: string | null = null;
    if (row?.encryptedKey) {
      try {
        keyMask = KeyCryptoService.mask(this.crypto.decrypt(row, KEY_CONTEXT));
      } catch {
        keyMask = '••••';
      }
    }
    return {
      configured: !!row,
      enabled: row?.enabled ?? false,
      baseUrl: row?.baseUrl ?? null,
      model: row?.model ?? null,
      hasKey: !!row?.encryptedKey,
      keyMask,
      jsonMode: row?.jsonMode ?? true,
      allowPrivateNetwork: row?.allowPrivateNetwork ?? false,
      updatedAt: row?.updatedAt ?? null,
      updatedById: row?.updatedById ?? null,
    };
  }

  /** Vista para el panel: la clave nunca sale, solo una máscara. */
  async getView(): Promise<InternalAiView> {
    return this.view(await this.prisma.internalAiConnection.findUnique({ where: { id: ROW_ID } }));
  }

  async save(input: InternalAiInput, userId: string): Promise<InternalAiView> {
    const allowPrivateNetwork = input.allowPrivateNetwork ?? false;
    const { url } = await this.checkUrl(input.baseUrl, allowPrivateNetwork);
    const model = input.model.trim();
    if (!model) throw new BadRequestException('Indica el modelo');

    // `apiKey` ausente conserva la guardada; vacía la borra; con texto la sustituye
    const key =
      input.apiKey === undefined
        ? {}
        : input.apiKey.trim() === ''
          ? { encryptedKey: null, keyIv: null, keyTag: null }
          : this.crypto.encrypt(input.apiKey.trim(), KEY_CONTEXT);
    const data = {
      baseUrl: url,
      model,
      jsonMode: input.jsonMode ?? true,
      allowPrivateNetwork,
      enabled: input.enabled ?? true,
      updatedById: userId,
      ...key,
    };
    const row = await this.prisma.internalAiConnection.upsert({ where: { id: ROW_ID }, create: { id: ROW_ID, ...data }, update: data });
    this.cache = null;
    this.logger.log(`IA interna actualizada por ${userId}: ${url} · ${model}${row.enabled ? '' : ' (desactivada)'}`);
    return this.view(row);
  }

  async remove(): Promise<InternalAiView> {
    await this.prisma.internalAiConnection.deleteMany({ where: { id: ROW_ID } });
    this.cache = null;
    return this.view(null);
  }

  /** Punto de extensión (y de sustitución en tests). */
  protected createProvider(baseUrl: string, apiKey: string | null, addresses: string[], jsonMode: boolean): LlmProvider {
    return new OpenAiCompatibleProvider(baseUrl, apiKey, addresses.length > 0 ? pinnedFetch(addresses) : fetch, {
      // Solo parámetros estándar de Chat Completions: vale para cualquier servidor compatible
      extraBody: jsonMode ? { response_format: { type: 'json_object' } } : {},
    });
  }

  private async build(row: any): Promise<InternalAiConnection> {
    // La URL se revalida en cada uso: su DNS pudo cambiar de destino desde que se guardó
    const { url, addresses } = await this.checkUrl(row.baseUrl, row.allowPrivateNetwork);
    const key = row.encryptedKey ? this.crypto.decrypt(row, KEY_CONTEXT) : null;
    return { provider: this.createProvider(url, key, addresses, row.jsonMode), model: row.model, jsonMode: row.jsonMode };
  }

  /**
   * Conexión lista para usar, o `null` si no hay ninguna configurada o está desactivada. Si la
   * guardada ya no es válida (URL que dejó de resolver, clave que no se descifra), también `null`:
   * quien la usa recurre a su respaldo.
   */
  async resolve(): Promise<InternalAiConnection | null> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value;
    let value: InternalAiConnection | null = null;
    try {
      const row = await this.prisma.internalAiConnection.findUnique({ where: { id: ROW_ID } });
      if (row?.enabled) value = await this.build(row);
    } catch (err: any) {
      this.logger.warn(`La conexión de IA interna no se puede usar: ${err?.message}`);
    }
    this.cache = { at: Date.now(), value };
    return value;
  }

  /** Prueba la conexión guardada (aunque esté desactivada). Lanza con un motivo legible si falla. */
  async test(): Promise<{ ok: true; model: string }> {
    const row = await this.prisma.internalAiConnection.findUnique({ where: { id: ROW_ID } });
    if (!row) throw new NotFoundException('Aún no hay una conexión de IA interna guardada');
    const conn = await this.build(row);
    try {
      await conn.provider.test(conn.model);
    } catch (err: any) {
      throw new BadRequestException(`La IA interna no respondió: ${String(err?.message ?? err).slice(0, 200)}`);
    }
    return { ok: true, model: conn.model };
  }
}
