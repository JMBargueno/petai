/**
 * AssetLoader del desktop (feature 009-edge-cdn, T011).
 *
 * Carga el `manifest` (CDN → fallback origin) y lo mantiene en memoria. `loadAsset(key)` resuelve
 * el asset siguiendo un orden de fallback FIJO:
 *   cache local (~/.petai/assets/, por `hash`) → CDN (URL versionada) → origin `GET /v1/assets/:key`
 *   (1 vez) → fallback embebido last-resort (?raw) → `AssetNotFound`.
 *
 * Deduplica por `key` (una descarga por asset, incluso con preloading concurrencia). Un 404 del CDN
 * dispara `onCdnMiss` (→ métrica `petai_cdn_fallback_origin_total`).
 */
import { AssetCache } from './asset-cache';

export interface Asset {
  url: string;
  hash: string;
  type: string;
  size: number;
}

export interface Manifest {
  version: string;
  baseUrl: string;
  generatedAt: string;
  assets: Record<string, Asset>;
}

/** Error del cliente: cache → CDN → origin → embebido no resolvieron la `key`. */
export class AssetNotFound extends Error {
  constructor(public readonly key: string) {
    super(`AssetNotFound: ${key}`);
    this.name = 'AssetNotFound';
  }
}

/** `fetch` abstraído (inyectable para tests). */
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface AssetLoaderOptions {
  /** URL del manifest en el CDN. */
  cdnManifestUrl?: string;
  /** URL del manifest en origin. */
  originManifestUrl?: string;
  /** Base origin para los assets (p. ej. `http://api/v1/assets`). */
  originBaseUrl?: string;
  /** `fetch` a usar (default `globalThis.fetch`). */
  fetch?: Fetcher;
  /** Last-resort embebido: `Blob` para una `key` si cache/CDN/origin fallan. */
  embeddedFallback?: (key: string) => Blob | null;
  /** Hooks de métricas (opcional). */
  onCdnHit?: () => void;
  onCdnMiss?: () => void;
  onOriginHit?: () => void;
  onOriginMiss?: () => void;
  onCacheHit?: () => void;
}

export class AssetLoader {
  private manifest: Manifest | null = null;
  private initPromise: Promise<Manifest> | null = null;
  /** Dedup: una descarga por `key`. */
  private inFlight = new Map<string, Promise<Blob>>();

  constructor(private readonly cache: AssetCache, private readonly opts: AssetLoaderOptions) {}

  private get fetch(): Fetcher {
    return this.opts.fetch ?? ((...args) => fetch(...args));
  }

  /** Carga el manifest (CDN → fallback origin) y lo cachea en memoria. Idempotente. */
  init(): Promise<Manifest> {
    if (!this.initPromise) this.initPromise = this.loadManifest();
    return this.initPromise;
  }

  private async loadManifest(): Promise<Manifest> {
    const candidates = [this.opts.cdnManifestUrl, this.opts.originManifestUrl].filter(
      Boolean,
    ) as string[];
    let lastError: unknown;
    for (const url of candidates) {
      try {
        const res = await this.fetch(url);
        if (!res.ok) throw new Error(`manifest ${res.status} en ${url}`);
        const manifest = (await res.json()) as Manifest;
        if (!manifest || typeof manifest.assets !== 'object') throw new Error('manifest inválido');
        this.manifest = manifest;
        return manifest;
      } catch (err) {
        lastError = err;
      }
    }
    throw new Error(
      `No se pudo cargar el manifest de assets: ${(lastError as Error)?.message ?? 'sin fuentes'}`,
    );
  }

  /** Devuelve la URL absoluta (CDN) de una `key`. `null` si la `key` no está en el manifest. */
  resolve(key: string): string | null {
    const asset = this.manifest?.assets[key];
    if (!asset) return null;
    const base = (this.manifest!.baseUrl || '').replace(/\/?$/, '');
    return `${base}/${asset.url}`;
  }

  /**
   * Descarga un asset. Orden fijo: cache local → CDN → origin (1 vez) → embebido → `AssetNotFound`.
   * `priority: 'low' | 'normal'` (el preloader usa `'low'`).
   */
  async loadAsset(key: string, opts?: { priority?: 'low' | 'normal' }): Promise<Blob> {
    await this.init();
    const asset = this.manifest!.assets[key];
    if (!asset) throw new AssetNotFound(key);

    // Deduplicación: una sola descarga por `key`.
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const promise = this.loadAssetImpl(key, asset);
    this.inFlight.set(key, promise);
    // Limpiamos la dedup cuando termina (éxito o fallo).
    promise.finally(() => this.inFlight.delete(key));
    void opts?.priority; // 'low' no bloquea el hilo principal; la concurrencia la limita el preloader.
    return promise;
  }

  private async loadAssetImpl(key: string, asset: Asset): Promise<Blob> {
    // 1) Cache local (por hash).
    const cached = await this.cache.get(asset.hash);
    if (cached) {
      this.opts.onCacheHit?.();
      return cached;
    }

    // 2) CDN (URL versionada).
    const cdnUrl = this.resolve(key)!;
    try {
      const res = await this.fetch(cdnUrl);
      if (res.ok) {
        const blob = await this.toBlob(res, asset.type);
        await this.cache.set(asset.hash, blob);
        this.opts.onCdnHit?.();
        return blob;
      }
      this.opts.onCdnMiss?.(); // 404 u otro status → fallback origin
    } catch {
      // error de red del CDN → fallback origin
    }

    // 3) Origin (1 vez) — fallback/mirror del CDN.
    if (this.opts.originBaseUrl) {
      const originUrl = `${this.opts.originBaseUrl.replace(/\/?$/, '')}/${key}`;
      try {
        const res = await this.fetch(originUrl);
        if (res.ok) {
          const blob = await this.toBlob(res, asset.type);
          await this.cache.set(asset.hash, blob);
          this.opts.onOriginHit?.();
          return blob;
        }
        this.opts.onOriginMiss?.();
      } catch {
        this.opts.onOriginMiss?.();
      }
    }

    // 4) Fallback embebido last-resort (?raw).
    if (this.opts.embeddedFallback) {
      const embedded = this.opts.embeddedFallback(key);
      if (embedded) return embedded;
    }

    // 5) Ninguno resolvió.
    throw new AssetNotFound(key);
  }

  /** `true` si el asset ya está en caché local (por `hash`). */
  async isCached(key: string): Promise<boolean> {
    await this.init();
    const asset = this.manifest!.assets[key];
    if (!asset) return false;
    return this.cache.exists(asset.hash);
  }

  /** Lista de `key`s disponibles en el manifest (tras `init`). */
  listKeys(): string[] {
    return this.manifest ? Object.keys(this.manifest.assets) : [];
  }

  /** Limpia los assets obsoletos del caché local (tras un re-deploy). */
  async pruneStale(): Promise<void> {
    await this.init();
    const keep = new Set(Object.values(this.manifest!.assets).map((a) => a.hash));
    await this.cache.prune(keep);
  }

  private async toBlob(res: Response, type: string): Promise<Blob> {
    const bytes = await res.arrayBuffer();
    return new Blob([bytes], { type });
  }
}