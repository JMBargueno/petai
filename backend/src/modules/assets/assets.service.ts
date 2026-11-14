import { BadRequestException, Inject, Injectable, InternalServerErrorException, Logger, NotFoundException, OnModuleInit, Optional } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { MetricsService } from '../../observability/metrics.service';

/**
 * Servicio origin de assets (feature 009-edge-cdn, T004).
 *
 * Actúa como MIRROR/fallback del CDN: sirve los assets de `shared/` (sprites, patterns, species y
 * game-data) con las mismas cabeceras de caché que el CDN. No toca Prisma — los assets son archivos.
 *
 *  - `GET /assets/manifest` → índice versionado (mismo formato que el pipeline `build:assets`).
 *  - `GET /assets/:key`     → contenido del asset (binario/JSON) con `Cache-Control: immutable`.
 */

/** Asset descubierto en disco (mirror del `DiscoveredAsset` del pipeline). */
interface LocalAsset {
  key: string;
  url: string;
  hash: string;
  type: string;
  size: number;
  absolutePath: string;
}

const MIME_BY_EXT: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
};

/** Base pública del CDN (placeholder; configurable por env `CDN_BASE_URL`). */
const DEFAULT_CDN_BASE_URL = 'https://cdn.petai.app/assets/';

const md5 = (buf: Buffer | string) => crypto.createHash('md5').update(buf).digest('hex');

@Injectable()
export class AssetsService implements OnModuleInit {
  private readonly logger = new Logger(AssetsService.name);
  private sharedDir = '';
  private manifest:
    | {
        version: string;
        baseUrl: string;
        generatedAt: string;
        assets: Record<string, { url: string; hash: string; type: string; size: number }>;
      }
    | null = null;
  /** `key` lógica → asset local (para servir `GET /assets/:key`). */
  private readonly byKey = new Map<string, LocalAsset>();

  constructor(@Optional() @Inject(MetricsService) private readonly metrics?: MetricsService) {}

  onModuleInit() {
    this.sharedDir = this.resolveSharedDir();
    this.rebuild();
    this.logger.log(`Origin assets listo: ${this.byKey.size} assets desde ${this.sharedDir}`);
  }

  /** Resuelve el directorio `shared/` (mismas candidatas que el game-data service). */
  private resolveSharedDir(): string {
    const candidates = [
      path.resolve(process.cwd(), 'shared'),
      path.resolve(process.cwd(), '../shared'),
      path.resolve(__dirname, '../../../../shared'),
      path.resolve(__dirname, '../../../shared'),
    ];
    return candidates.find((dir) => fs.existsSync(dir)) || candidates[0];
  }

  /** Reescanea `shared/` y reconstruye el manifest + el mapa de keys (idempotente). */
  rebuild(): void {
    const assetsDir = path.join(this.sharedDir, 'assets');
    const gameDataDir = path.join(this.sharedDir, 'game-data');
    const found: LocalAsset[] = [];

    const ingest = (relFromShared: string, absolutePath: string) => {
      if (!fs.existsSync(absolutePath)) return;
      const hash = md5(fs.readFileSync(absolutePath));
      const ext = path.extname(absolutePath);
      found.push({
        key: this.toLogicalKey(relFromShared),
        url: this.toVersionedUrl(relFromShared, hash),
        hash,
        type: MIME_BY_EXT[ext] ?? 'application/octet-stream',
        size: fs.statSync(absolutePath).size,
        absolutePath,
      });
    };

    for (const rel of this.walk(assetsDir)) {
      ingest(`assets/${rel}`, path.join(assetsDir, rel.split('/').join(path.sep)));
    }
    for (const rel of this.walk(gameDataDir)) {
      ingest(`game-data/${rel}`, path.join(gameDataDir, rel.split('/').join(path.sep)));
    }

    found.sort((a, b) => a.key.localeCompare(b.key));

    const assets: Record<string, { url: string; hash: string; type: string; size: number }> = {};
    const hashes: string[] = [];
    for (const a of found) {
      this.byKey.set(a.key, a);
      assets[a.key] = { url: a.url, hash: a.hash, type: a.type, size: a.size };
      hashes.push(a.hash);
    }

    const digest = md5(hashes.join('\n') || '').slice(0, 8);
    const datestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
    this.manifest = {
      version: `${datestamp}-${digest}`,
      baseUrl: process.env.CDN_BASE_URL ? `${process.env.CDN_BASE_URL.replace(/\/?$/, '')}/` : DEFAULT_CDN_BASE_URL,
      generatedAt: new Date().toISOString(),
      assets,
    };
  }

  /** Manifiest vigente. `500` si aún no se ha generado (shared/ inaccesible). */
  getManifest(): {
    version: string;
    baseUrl: string;
    generatedAt: string;
    assets: Record<string, { url: string; hash: string; type: string; size: number }>;
  } {
    if (!this.manifest) throw new InternalServerErrorException('El manifest de assets no está disponible');
    return this.manifest;
  }

  /** ETag del manifest (MD5 del JSON) para revalidación. */
  getManifestEtag(): string {
    return md5(JSON.stringify(this.getManifest().assets));
  }

  /**
   * Sirve el asset con `key` lógica (sin hash). Valida el `key` (anti path-traversal), localiza el
   * archivo en `shared/` y devuelve su contenido.
   *
   * Errores: `400` key mal formada, `404` no existe, `500` fallo de lectura.
   */
  getAsset(key: string): { buffer: Buffer; type: string; size: number } {
    if (!this.isValidKey(key)) throw new BadRequestException('Key inválida');
    const asset = this.byKey.get(key);
    if (!asset) throw new NotFoundException('Asset no encontrado');
    try {
      const buffer = fs.readFileSync(asset.absolutePath);
      return { buffer, type: asset.type, size: asset.size };
    } catch {
      throw new InternalServerErrorException('Error interno de lectura del asset');
    }
  }

  /** Lista de keys disponibles (útil para tests/validación). */
  getKeys(): string[] {
    return [...this.byKey.keys()];
  }

  // --- Helpers de key/url (mirror de `scripts/build-assets.ts`) ---

  /** `true` si el `key` es una ruta lógica válida (sin path-traversal ni caracteres de red). */
  private isValidKey(key: string): boolean {
    if (typeof key !== 'string' || key.length === 0) return false;
    if (key.startsWith('/') || key.includes('..') || key.includes('\\') || /\s/.test(key)) return false;
    if (key.includes('%')) return false; // posible doble-encoding de `..`
    return key.split('/').every((s) => /^[A-Za-z0-9._-]+$/.test(s));
  }

  /** `assets/sprites/ignisaur_idle.svg` -> `sprites/ignisaur_idle`. */
  private toLogicalKey(relFromShared: string): string {
    const noExt = relFromShared.replace(/\.[^./]+$/, '');
    return noExt.replace(/^assets\//, '');
  }

  /** `assets/sprites/ignisaur_idle.svg` + hash -> `sprites/ignisaur_idle-<hash8>.svg`. */
  private toVersionedUrl(relFromShared: string, hash: string): string {
    const ext = path.extname(relFromShared);
    const dir = path.posix.dirname(relFromShared);
    const base = path.posix.basename(relFromShared, ext);
    const versioned = `${base}-${hash.slice(0, 8)}${ext}`;
    const dirPart = dir === '.' ? '' : dir.replace(/^assets\//, '');
    return dirPart ? `${dirPart}/${versioned}` : versioned;
  }

  /** Lista recursiva de archivos (relativa a `fromDir`, separadores POSIX). */
  private walk(fromDir: string): string[] {
    const out: string[] = [];
    if (!fs.existsSync(fromDir)) return out;
    const rec = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) rec(full);
        else if (entry.isFile()) out.push(path.relative(fromDir, full).split(path.sep).join('/'));
      }
    };
    rec(fromDir);
    return out.sort();
  }
}