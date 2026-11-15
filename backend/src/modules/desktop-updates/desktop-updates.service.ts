import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Entrada de plataforma del `latest.json` que genera tauri-action. */
interface PlatformEntry {
  signature: string;
  url: string;
}

/** `latest.json` del updater de Tauri (formato estático). */
interface LatestJson {
  version: string;
  notes?: string;
  pub_date?: string;
  platforms: Record<string, PlatformEntry>;
}

interface ReleaseAsset {
  id: number;
  name: string;
  url: string;
}

interface CachedRelease {
  latest: LatestJson;
  assets: ReleaseAsset[];
  fetchedAt: number;
}

/** Respuesta para el updater de Tauri (formato dinámico). */
export interface UpdateManifest {
  version: string;
  notes: string;
  pub_date?: string;
  signature: string;
  /** Id del asset de GitHub; el controller construye la URL de descarga absoluta. */
  assetId: number;
}

const GITHUB_API = 'https://api.github.com';
const CACHE_TTL_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 8000;
const DEFAULT_REPO = 'JMBargueno/petai';

/** Compara versiones semver `a.b.c[-pre]`. Devuelve >0 si `a` es mayor que `b`. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre] = v.replace(/^v/, '').split('-', 2);
    return { nums: core.split('.').map((n) => parseInt(n, 10) || 0), pre };
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0);
    if (d !== 0) return d;
  }
  // Una versión sin prerelease es mayor que la misma con prerelease (1.0.0 > 1.0.0-beta).
  if (pa.pre && !pb.pre) return -1;
  if (!pa.pre && pb.pre) return 1;
  return (pa.pre ?? '').localeCompare(pb.pre ?? '');
}

/**
 * Proxy del updater de escritorio: el repo es privado, así que los clientes no pueden leer los
 * releases de GitHub. El backend lee el último release PUBLICADO (los borradores no cuentan) con un
 * token de solo lectura y sirve el manifest; los binarios se redirigen a la URL firmada de GitHub.
 * Sin token configurado no hay actualizaciones (nunca falla).
 */
@Injectable()
export class DesktopUpdatesService {
  private readonly logger = new Logger(DesktopUpdatesService.name);
  private cache: CachedRelease | null = null;

  constructor(private readonly config: ConfigService) {}

  private get token(): string | undefined {
    return this.config.get<string>('GITHUB_RELEASES_TOKEN') || undefined;
  }

  private get repo(): string {
    return this.config.get<string>('GITHUB_RELEASES_REPO') || DEFAULT_REPO;
  }

  private headers(accept: string): Record<string, string> {
    return {
      Accept: accept,
      Authorization: `Bearer ${this.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'pockai-backend',
    };
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /** Último release publicado con su `latest.json`, cacheado 5 min. `null` si no hay o falla. */
  private async getRelease(): Promise<CachedRelease | null> {
    if (!this.token) return null;
    if (this.cache && Date.now() - this.cache.fetchedAt < CACHE_TTL_MS) return this.cache;
    try {
      const res = await this.fetchWithTimeout(`${GITHUB_API}/repos/${this.repo}/releases/latest`, {
        headers: this.headers('application/vnd.github+json'),
      });
      if (!res.ok) {
        this.logger.warn(`GitHub releases/latest respondió ${res.status}`);
        return this.cache;
      }
      const release = (await res.json()) as { assets?: ReleaseAsset[] };
      const assets = release.assets ?? [];
      const latestAsset = assets.find((a) => a.name === 'latest.json');
      if (!latestAsset) {
        this.logger.warn('El último release no tiene latest.json');
        return this.cache;
      }
      const jsonRes = await this.fetchWithTimeout(latestAsset.url, {
        headers: this.headers('application/octet-stream'),
      });
      if (!jsonRes.ok) {
        this.logger.warn(`Descarga de latest.json respondió ${jsonRes.status}`);
        return this.cache;
      }
      const latest = JSON.parse(await jsonRes.text()) as LatestJson;
      this.cache = { latest, assets, fetchedAt: Date.now() };
      return this.cache;
    } catch (err) {
      this.logger.warn(`No se pudo consultar GitHub: ${(err as Error).message}`);
      return this.cache;
    }
  }

  /** Manifest de actualización para `target-arch`, o `null` si no hay versión más nueva. */
  async findUpdate(target: string, arch: string, currentVersion: string): Promise<UpdateManifest | null> {
    const release = await this.getRelease();
    if (!release) return null;
    const { latest, assets } = release;
    if (!latest?.version || compareVersions(latest.version, currentVersion) <= 0) return null;

    const platform = latest.platforms?.[`${target}-${arch}`];
    if (!platform) return null;
    // La URL pública de GitHub no sirve (repo privado): localizamos el asset por su nombre de fichero.
    const fileName = decodeURIComponent(platform.url.split('/').pop() ?? '');
    const asset = assets.find((a) => a.name === fileName);
    if (!asset) return null;

    return {
      version: latest.version,
      notes: latest.notes ?? '',
      pub_date: latest.pub_date,
      signature: platform.signature,
      assetId: asset.id,
    };
  }

  /** URL firmada y temporal de GitHub para descargar un asset del release actual. */
  async getDownloadUrl(assetId: number): Promise<string> {
    const release = await this.getRelease();
    const asset = release?.assets.find((a) => a.id === assetId);
    if (!asset) throw new NotFoundException('Asset no encontrado');

    const res = await this.fetchWithTimeout(asset.url, {
      headers: this.headers('application/octet-stream'),
      redirect: 'manual',
    });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) return location;
    this.logger.warn(`GitHub no devolvió redirección para el asset ${assetId} (status ${res.status})`);
    throw new NotFoundException('Asset no disponible');
  }
}
