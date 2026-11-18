import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RealtimeGateway } from '../realtime/realtime.gateway';

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

/** Release de GitHub: solo los campos que usamos (releases/latest o /releases). */
interface ReleaseMeta {
  id: number;
  tag_name?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: ReleaseAsset[];
}

interface CachedRelease {
  /**
   * Manifest del `latest.json` (best-effort). `null` si el release no lo trae o su lectura falla:
   * la web descarga el instalador a partir de `assets` y no necesita `latest.json`.
   */
  latest: LatestJson | null;
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

export const INSTALLER_PLATFORMS = ['windows', 'macos'] as const;
export type InstallerPlatform = (typeof INSTALLER_PLATFORMS)[number];

/** Nombre del instalador que genera tauri-action en cada plataforma. */
const INSTALLER_PATTERNS: Record<InstallerPlatform, RegExp> = {
  windows: /-setup\.exe$/i,
  macos: /\.dmg$/i,
};

const GITHUB_API = 'https://api.github.com';
const CACHE_TTL_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 8000;
const DEFAULT_REPO = 'JMBargueno/petai';
/**
 * Re-resoluciones de `releases/latest` si el instalador en cache ya no descarga. Un release
 * re-escrito (borrado y re-creado por la CI) cambia los ids de sus assets; esto limita cuántas
 * veces intentamos recuperar uno válido antes de devolver 404.
 */
const MAX_INSTALLER_RETRIES = 3;
/**
 * Ventana corta de reutilización de la URL firmada por asset. La firmada de GitHub dura ~1h;
 * mantenemos una ventana de un minuto para ir fresco sin volver a pedir la redirección a cada
 * petición.
 */
const SIGNED_URL_TTL_MS = 60 * 1000;

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
  /**
   * Fetch de `releases/latest` en curso. Se comparte entre peticiones concurrentes para no disparar
   * N llamadas a GitHub a la vez (thundering herd) ni escribir la cache de forma enrevesada.
   */
  private inflight: Promise<CachedRelease | null> | null = null;
  /**
   * Últimas URLs firmadas validadas, por id de asset (ventana corta). Evita re-pedir la
   * redirección a GitHub en cada descarga y acorta la ventana de riesgo entre «validar» y «servir».
   */
  private signedUrls = new Map<number, { url: string; at: number }>();

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly realtime?: RealtimeGateway,
  ) {}

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

  /**
   * Último release PUBLICADO con sus assets, cacheado 5 min. `null` si no hay token, no hay release
   * o falla (en cuyo caso devuelve la última cache válida si la hay). `force` obliga a re-consultar
   * GitHub aunque haya cache vigente: es el mecanismo de auto-recuperación cuando el asset en cache
   * deja de existir (release borrado y re-creado).
   */
  private async getRelease(opts: { force?: boolean } = {}): Promise<CachedRelease | null> {
    if (!this.token) return null;
    if (this.inflight) return this.inflight; // ya hay una re-resolución en curso: se reutiliza
    const fresh = this.cache && Date.now() - this.cache.fetchedAt < CACHE_TTL_MS;
    if (fresh && !opts.force) return this.cache;

    const run = (async (): Promise<CachedRelease | null> => {
      try {
        // Primero `releases/latest`; si no da nada usable, la lista `/releases` (defensa frente a un
        // endpoint «latest» que sirva un release reescrito o vacío).
        const meta = (await this.fetchLatestReleaseMeta()) ?? (await this.fetchLatestFromList());
        if (!meta) {
          this.logger.warn('No se pudo resolver ningún release publicado con assets en GitHub');
          return this.cache; // sin datos nuevos: mantenemos la última cache válida
        }
        const assets = meta.assets ?? [];
        const latest = await this.fetchLatestJson(assets);
        const previousVersion = this.cache?.latest?.version;
        this.cache = { latest, assets, fetchedAt: Date.now() };

        if (latest?.version && (!previousVersion || compareVersions(latest.version, previousVersion) > 0)) {
          this.realtime?.emitDesktopUpdateAvailable(latest.version, latest.notes);
        }
        return this.cache;
      } catch (err) {
        this.logger.warn(`No se pudo consultar GitHub: ${(err as Error).message}`);
        return this.cache;
      } finally {
        this.inflight = null;
      }
    })();
    this.inflight = run;
    return run;
  }

  /** `GET releases/latest` (el más nuevo no-prerelance/no-borrador), o `null` si no es usable. */
  private async fetchLatestReleaseMeta(): Promise<ReleaseMeta | null> {
    const res = await this.fetchWithTimeout(`${GITHUB_API}/repos/${this.repo}/releases/latest`, {
      headers: this.headers('application/vnd.github+json'),
    });
    if (!res.ok) {
      this.logger.warn(`GitHub releases/latest respondió ${res.status}`);
      return null;
    }
    const meta = (await res.json()) as ReleaseMeta;
    return meta && Array.isArray(meta.assets) && meta.assets.length > 0 ? meta : null;
  }

  /**
   * Fallback a `GET /releases` (ordenado de más nuevo a más antiguo) si `releases/latest` no da
   * nada usable. Tomamos el primer release publicado (no borrador, no prerelance) con assets.
   */
  private async fetchLatestFromList(): Promise<ReleaseMeta | null> {
    const res = await this.fetchWithTimeout(`${GITHUB_API}/repos/${this.repo}/releases?per_page=15`, {
      headers: this.headers('application/vnd.github+json'),
    });
    if (!res.ok) {
      this.logger.warn(`GitHub /releases respondió ${res.status}`);
      return null;
    }
    const list = (await res.json()) as ReleaseMeta[];
    return (
      list.find(
        (r) => !r.draft && !r.prerelease && Array.isArray(r.assets) && r.assets.length > 0,
      ) ?? null
    );
  }

  /** Lee `latest.json` del release (best-effort; la descarga de la web no lo necesita). */
  private async fetchLatestJson(assets: ReleaseAsset[]): Promise<LatestJson | null> {
    const latestAsset = assets.find((a) => a.name === 'latest.json');
    if (!latestAsset) {
      this.logger.warn('El último release no tiene latest.json');
      return null;
    }
    const jsonRes = await this.fetchWithTimeout(latestAsset.url, {
      headers: this.headers('application/octet-stream'),
    });
    if (!jsonRes.ok) {
      this.logger.warn(`Descarga de latest.json respondió ${jsonRes.status}`);
      return null;
    }
    try {
      return JSON.parse(await jsonRes.text()) as LatestJson;
    } catch {
      this.logger.warn('latest.json no es un JSON válido');
      return null;
    }
  }

  /**
   * URL firmada a la que redirige `asset.url` (lo sirve GitHub para repos privados), o `null` si no
   * redirige: ese es el síntoma de que el asset ya no existe (release borrado o re-creado).
   */
  private async fetchSignedUrl(asset: ReleaseAsset): Promise<string | null> {
    const res = await this.fetchWithTimeout(asset.url, {
      headers: this.headers('application/octet-stream'),
      redirect: 'manual',
    });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) return location;
    this.logger.warn(`GitHub no devolvió redirección para el asset ${asset.id} (status ${res.status})`);
    return null;
  }

  /** Purga la cache en memoria para que la siguiente consulta re-resuelva el último release. */
  private invalidateCache(): void {
    this.cache = null;
    this.signedUrls.clear();
  }

  private rememberSignedUrl(assetId: number, url: string): void {
    const now = Date.now();
    for (const [id, entry] of this.signedUrls) {
      if (now - entry.at > SIGNED_URL_TTL_MS) this.signedUrls.delete(id);
    }
    this.signedUrls.set(assetId, { url, at: now });
  }

  private getFreshSignedUrl(assetId: number): string | null {
    const entry = this.signedUrls.get(assetId);
    if (!entry) return null;
    if (Date.now() - entry.at > SIGNED_URL_TTL_MS) {
      this.signedUrls.delete(assetId);
      return null;
    }
    return entry.url;
  }

  /** Manifest de actualización para `target-arch`, o `null` si no hay versión más nueva. */
  async findUpdate(target: string, arch: string, currentVersion: string): Promise<UpdateManifest | null> {
    const release = await this.getRelease();
    const { latest, assets } = release ?? { latest: null, assets: [] };
    if (!latest) return null; // sin latest.json no hay manifiesto que servir
    if (!latest.version || compareVersions(latest.version, currentVersion) <= 0) return null;

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

  /**
   * Id del instalador del último release publicado para una plataforma (enlace fijo de la web).
   * Windows: el `*-setup.exe` (NSIS); macOS: el `.dmg` (Apple Silicon si existe).
   *
   * No devuelve un id a ciegas: valida que el asset redirige de verdad. Si el de la cache ya no
   * existe (release borrado y re-creado por la CI → ids nuevos), purga la cache y vuelve a resolver
   * el último release, hasta agotar los reintentos. Así la web nunca recibe un enlace muerto.
   */
  async findInstallerAssetId(platform: InstallerPlatform): Promise<number> {
    for (let attempt = 0; attempt < MAX_INSTALLER_RETRIES; attempt++) {
      const release = await this.getRelease(attempt > 0 ? { force: true } : {});
      const candidate = this.pickInstallerAsset(release?.assets ?? [], platform);
      if (candidate) {
        const url = await this.fetchSignedUrl(candidate);
        if (url) {
          this.rememberSignedUrl(candidate.id, url);
          return candidate.id;
        }
      }
      this.logger.warn(
        `Instalador de ${platform} sin validar en el intento ${attempt + 1}; re-resolviendo el último release`,
      );
      this.invalidateCache();
    }
    throw new NotFoundException('Instalador no disponible');
  }

  /** Candidato a instalador para `platform` según el patrón de nombre (macOS prefiere `aarch64`). */
  private pickInstallerAsset(
    assets: ReleaseAsset[],
    platform: InstallerPlatform,
  ): ReleaseAsset | undefined {
    const candidates = assets.filter((a) => INSTALLER_PATTERNS[platform].test(a.name));
    return platform === 'macos'
      ? candidates.find((a) => /aarch64/i.test(a.name)) ?? candidates[0]
      : candidates[0];
  }

  /**
   * URL firmada y temporal de GitHub para descargar un asset del release actual. Si la asset que
   * traía la cache ya no existe, purga la cache para que las siguientes consultas re-resuelvan el
   * último release (y no sigan sirviendo el 404).
   */
  async getDownloadUrl(assetId: number): Promise<string> {
    const fresh = this.getFreshSignedUrl(assetId);
    if (fresh) return fresh; // reutiliza una URL firmada validada hace < SIGNED_URL_TTL_MS

    const release = await this.getRelease();
    const asset = release?.assets.find((a) => a.id === assetId);
    if (!asset) {
      this.invalidateCache();
      throw new NotFoundException('Asset no encontrado');
    }
    const url = await this.fetchSignedUrl(asset);
    if (!url) {
      this.invalidateCache();
      throw new NotFoundException('Asset no disponible');
    }
    this.rememberSignedUrl(assetId, url);
    return url;
  }
}
