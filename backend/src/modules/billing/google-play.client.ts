import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPublicKey, createSign, createVerify, JsonWebKey } from 'crypto';

const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const ANDROID_PUBLISHER_BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
const CLOCK_SKEW_S = 60;

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

/** Subconjunto de `SubscriptionPurchaseV2` que usamos. */
export interface PlaySubscriptionV2 {
  subscriptionState?: string;
  acknowledgementState?: string;
  linkedPurchaseToken?: string;
  lineItems?: Array<{ productId?: string; expiryTime?: string }>;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  testPurchase?: Record<string, unknown>;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlDecode(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/**
 * Cliente mínimo de Google Play (sin dependencias): token OAuth de cuenta de servicio,
 * `purchases.subscriptionsv2.get`, `acknowledge` y verificación del JWT OIDC de los push de Pub/Sub (RTDN).
 */
@Injectable()
export class GooglePlayClient {
  private readonly logger = new Logger(GooglePlayClient.name);
  private readonly account: ServiceAccount | null;
  private accessToken: { value: string; expiresAt: number } | null = null;
  private certs: { keys: Map<string, JsonWebKey>; expiresAt: number } | null = null;

  /** Sustituible en tests. */
  fetchImpl: typeof fetch = (input, init) => fetch(input, init);

  constructor(private readonly config: ConfigService) {
    this.account = this.parseServiceAccount(this.config.get<string>('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON'));
  }

  get packageName(): string | undefined {
    return this.config.get<string>('GOOGLE_PLAY_PACKAGE_NAME') || undefined;
  }

  /** ¿Hay credenciales para consultar la API de Play? */
  get isConfigured(): boolean {
    return !!this.account && !!this.packageName;
  }

  /** ¿Hay audiencia y cuenta de servicio esperadas para autenticar los push de RTDN? */
  get isRtdnAuthConfigured(): boolean {
    return !!this.config.get<string>('GOOGLE_RTDN_AUDIENCE') && !!this.config.get<string>('GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL');
  }

  /** Productos de suscripción aceptados (lista cerrada). */
  allowedProductIds(): Set<string> {
    const raw = this.config.get<string>('GOOGLE_PLAY_PRODUCT_IDS') || 'pockai_pro_monthly';
    return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
  }

  async getSubscription(purchaseToken: string): Promise<PlaySubscriptionV2> {
    const url = `${ANDROID_PUBLISHER_BASE}/${encodeURIComponent(this.packageName!)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
    const res = await this.fetchImpl(url, { headers: { Authorization: `Bearer ${await this.getAccessToken()}` } });
    if (res.status === 404 || res.status === 410 || res.status === 400) {
      throw new PlayPurchaseNotFoundError(`Google Play rechazó el token (${res.status})`);
    }
    if (!res.ok) throw new Error(`Google Play API respondió ${res.status}`);
    return (await res.json()) as PlaySubscriptionV2;
  }

  async acknowledge(productId: string, purchaseToken: string): Promise<void> {
    const url = `${ANDROID_PUBLISHER_BASE}/${encodeURIComponent(this.packageName!)}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.getAccessToken()}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) throw new Error(`No se pudo reconocer la compra en Google Play (${res.status})`);
  }

  /**
   * Verifica el `Authorization: Bearer <jwt>` que Pub/Sub añade a los push autenticados:
   * firma RS256 contra los certificados de Google, emisor, audiencia, caducidad y cuenta de servicio.
   */
  async verifyPubSubToken(authorization: string | undefined): Promise<boolean> {
    if (!authorization?.startsWith('Bearer ')) return false;
    const parts = authorization.slice(7).trim().split('.');
    if (parts.length !== 3) return false;
    try {
      const header = JSON.parse(b64urlDecode(parts[0]).toString('utf8'));
      const payload = JSON.parse(b64urlDecode(parts[1]).toString('utf8'));
      if (header.alg !== 'RS256' || typeof header.kid !== 'string') return false;

      const jwk = await this.getCert(header.kid);
      if (!jwk) return false;
      const verifier = createVerify('RSA-SHA256');
      verifier.update(`${parts[0]}.${parts[1]}`);
      if (!verifier.verify(createPublicKey({ key: jwk, format: 'jwk' }), b64urlDecode(parts[2]))) return false;

      const now = Math.floor(Date.now() / 1000);
      if (!GOOGLE_ISSUERS.has(payload.iss)) return false;
      if (payload.aud !== this.config.get<string>('GOOGLE_RTDN_AUDIENCE')) return false;
      if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_S < now) return false;
      if (typeof payload.iat === 'number' && payload.iat - CLOCK_SKEW_S > now) return false;
      if (payload.email !== this.config.get<string>('GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL')) return false;
      if (payload.email_verified !== true) return false;
      return true;
    } catch (err: any) {
      this.logger.warn(`JWT de Pub/Sub inválido: ${err?.message}`);
      return false;
    }
  }

  private parseServiceAccount(raw: string | undefined): ServiceAccount | null {
    if (!raw) return null;
    try {
      const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
      const parsed = JSON.parse(text);
      if (typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string') return null;
      return parsed;
    } catch {
      this.logger.error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON no es un JSON de cuenta de servicio válido');
      return null;
    }
  }

  private async getAccessToken(): Promise<string> {
    if (!this.account) throw new Error('Google Play no está configurado');
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) return this.accessToken.value;

    const tokenUri = this.account.token_uri || 'https://oauth2.googleapis.com/token';
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(
      JSON.stringify({ iss: this.account.client_email, scope: ANDROID_PUBLISHER_SCOPE, aud: tokenUri, iat: now, exp: now + 3600 }),
    )}`;
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    const assertion = `${unsigned}.${b64url(signer.sign(this.account.private_key))}`;

    const res = await this.fetchImpl(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    });
    if (!res.ok) throw new Error(`No se pudo obtener el token OAuth de Google (${res.status})`);
    const body = (await res.json()) as { access_token: string; expires_in?: number };
    this.accessToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return body.access_token;
  }

  private async getCert(kid: string): Promise<JsonWebKey | undefined> {
    if (!this.certs || this.certs.expiresAt < Date.now() || !this.certs.keys.has(kid)) {
      const res = await this.fetchImpl(GOOGLE_CERTS_URL);
      if (!res.ok) throw new Error(`No se pudieron obtener los certificados de Google (${res.status})`);
      const body = (await res.json()) as { keys: Array<JsonWebKey & { kid: string }> };
      this.certs = { keys: new Map(body.keys.map((k) => [k.kid, k])), expiresAt: Date.now() + 3600_000 };
    }
    return this.certs.keys.get(kid);
  }
}

export class PlayPurchaseNotFoundError extends Error {}
