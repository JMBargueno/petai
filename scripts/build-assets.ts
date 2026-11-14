/**
 * Pipeline de assets de PetAI (feature 009-edge-cdn).
 *
 * Escanea `shared/assets/**` y `shared/game-data/*.json`, calcula el MD5 de cada archivo y genera:
 *   - nombres versionados por hash:  `<name>-<hash8>.<ext>`
 *   - un `manifest` `{ version, baseUrl, generatedAt, assets: { key: { url, hash, type, size } } }`
 *
 * Estructura de `key` (se conserva la existente, ver api-contract.md):
 *   - `sprites/<spriteKey>_<anim>`   (p. ej. `sprites/ignisaur_idle`)
 *   - `patterns/<id>`                (p. ej. `patterns/scales`)
 *   - `species/<id>/base` | `species/<id>/mask` | `species/<id>/anim`
 *   - `game-data/<file>`             (p. ej. `game-data/balance`)
 *
 * El `url` de cada asset es relativo al `baseUrl` del CDN. El upload a Cloudflare R2 es ATÓMICO:
 * primero se suben todos los assets (con `Cache-Control: immutable`) y, al final, el
 * `manifest.json` (con `Cache-Control: max-age=3600, stale-while-revalidate=60`). Un manifest
 * parcial que apuntara a assets aún no subidos queda así descartado.
 *
 * Uso (CLI):  `pnpm build:assets`  (o `tsx scripts/build-assets.ts [--dry-run] [--out <dir>]`)
 *
 * Las funciones "puras" (hashing, descubrimiento, manifest) se exportan para que `build-assets.spec.ts`
 * pueda probarlas sin tocar R2. El módulo solo ejecuta el CLI cuando se importa como script principal.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Entrada de un asset dentro del `manifest.assets`. */
export interface AssetEntry {
  /** Ruta relativa versionada por hash (p. ej. `sprites/ignisaur_idle-a3b2f1.svg`). */
  url: string;
  /** MD5 completo del contenido (hex). Idempotente/inmutable. */
  hash: string;
  /** MIME tipo (p. ej. `image/svg+xml`, `image/png`, `application/json`). */
  type: string;
  /** Tamaño en bytes. */
  size: number;
}

/** Manifest publicado (idéntico al contrato de `GET /assets/manifest`). */
export interface Manifest {
  version: string;
  baseUrl: string;
  generatedAt: string;
  assets: Record<string, AssetEntry>;
}

/** Asset descubierto en disco (incluye la `key` lógica y la ruta absoluta de origen). */
export interface DiscoveredAsset extends AssetEntry {
  key: string;
  absolutePath: string;
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** MIME por extensión de los assets que gestiona el pipeline. */
export const MIME_BY_EXT: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/** Cabeceras de caché del contrato (api-contract.md). */
export const CACHE_HEADERS = {
  /** Assets (nombre por hash): inmutables. */
  immutable: 'public, max-age=31536000, immutable',
  /** Manifest: 1 h + revalidación en background a los 60 s. */
  manifest: 'public, max-age=3600, stale-while-revalidate=60',
} as const;

// ---------------------------------------------------------------------------
// Funciones puras (testables)
// ---------------------------------------------------------------------------

/** MD5 (hex) de un buffer o cadena. */
export function md5(value: Buffer | string): string {
  return crypto.createHash('md5').update(value).digest('hex');
}

/** Nombre versionado `<name>-<hash8>.<ext>` a partir del nombre base (sin ext) y el hash completo. */
export function versionedName(baseName: string, ext: string, hash: string): string {
  const hash8 = hash.slice(0, 8);
  return `${baseName}-${hash8}${ext}`;
}

/** MIME tipo según la extensión (default `application/octet-stream`). */
export function mimeFor(ext: string): string {
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

/**
 * Convierte una ruta relativa dentro de `shared/` (con separadores POSIX) a su `key` lógica del
 * manifest.  El `key` es la ruta sin la extensión:
 *   - `assets/sprites/ignisaur_idle.svg`  -> `sprites/ignisaur_idle`
 *   - `assets/species/ignisaur/base.png`  -> `species/ignisaur/base`
 *   - `assets/palettes.json`              -> `palettes`
 *   - `game-data/balance.json`            -> `game-data/balance`
 */
export function toLogicalKey(relFromShared: string): string {
  const posix = relFromShared.split(path.sep).join('/');
  const noExt = posix.replace(/\.[^./]+$/, '');
  return noExt.replace(/^assets\//, '');
}
/** Lista recursiva de archivos dentro de un directorio (relativa a `fromDir`, separadores POSIX). */
export function walkFiles(fromDir: string): string[] {
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

/**
 * Descubre todos los assets (sprites/patterns/species + game-data) dentro de `root`.
 * `root` es la raíz del repositorio (donde vive `shared/`).
 */
export function discoverAssets(root: string): DiscoveredAsset[] {
  const sharedDir = path.join(root, 'shared');
  const assetsDir = path.join(sharedDir, 'assets');
  const gameDataDir = path.join(sharedDir, 'game-data');
  const assets: DiscoveredAsset[] = [];

  const ingest = (relFromShared: string, absolutePath: string) => {
    const hash = md5(fs.readFileSync(absolutePath));
    const ext = path.extname(absolutePath);
    assets.push({
      key: toLogicalKey(relFromShared),
      url: toVersionedUrl(relFromShared, hash),
      hash,
      type: mimeFor(ext),
      size: fs.statSync(absolutePath).size,
      absolutePath,
    });
  };

  for (const rel of walkFiles(assetsDir)) {
    ingest(path.posix.join('assets', rel), path.join(assetsDir, rel.split('/').join(path.sep)));
  }
  for (const rel of walkFiles(gameDataDir)) {
    ingest(path.posix.join('game-data', rel), path.join(gameDataDir, rel.split('/').join(path.sep)));
  }

  return assets.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Construye el `manifest` a partir de los assets descubiertos. La `version` es
 * `<YYYY.MM.DD>-<hash8>` donde `hash8` es un resumen (MD5) de todos los hashes.
 */
export function buildManifest(
  assets: DiscoveredAsset[],
  baseUrl: string,
  generatedAt: Date = new Date(),
): Manifest {
  const assetMap: Record<string, AssetEntry> = {};
  const hashes: string[] = [];
  for (const a of assets) {
    assetMap[a.key] = { url: a.url, hash: a.hash, type: a.type, size: a.size };
    hashes.push(a.hash);
  }
  const digest = md5(hashes.join('\n') || '').slice(0, 8);
  const datestamp = generatedAt.toISOString().slice(0, 10).replace(/-/g, '.');
  return {
    version: `${datestamp}-${digest}`,
    baseUrl: baseUrl.replace(/\/?$/, '/'),
    generatedAt: generatedAt.toISOString(),
    assets: assetMap,
  };
}

// ---------------------------------------------------------------------------
// Configuración de entorno (R2) — validada con zod cuando hay upload
// ---------------------------------------------------------------------------

/** Env para el upload a Cloudflare R2. Se valida con `zod` (Constitución V/VIII). */
export interface R2Env {
  CLOUDFLARE_R2_ACCESS_KEY_ID: string;
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: string;
  CLOUDFLARE_R2_BUCKET: string;
  /** Endpoint S3-compatible de R2. */
  CLOUDFLARE_R2_ENDPOINT: string;
  /** Región (R2 usa `auto`). */
  CLOUDFLARE_R2_REGION?: string;
  /** Base pública del CDN que se escribe en `manifest.baseUrl`. */
  CDN_BASE_URL: string;
}

/** `true` si hay credenciales R2 suficientes para el upload. */
export function isR2Configured(env: Record<string, string | undefined>): boolean {
  return Boolean(
    env.CLOUDFLARE_R2_ACCESS_KEY_ID &&
      env.CLOUDFLARE_R2_SECRET_ACCESS_KEY &&
      env.CLOUDFLARE_R2_BUCKET &&
      env.CLOUDFLARE_R2_ENDPOINT &&
      env.CDN_BASE_URL,
  );
}

/**
 * Valida las credenciales R2 con `zod`. Lanza si alguna es inválida. La cadena secreta se valida
 * pero NUNCA se loguea (Constitución V/VIII).
 */
export async function validateR2Env(env: Record<string, string | undefined>): Promise<R2Env> {
  const { z } = await import('zod');
  const schema = z.object({
    CLOUDFLARE_R2_ACCESS_KEY_ID: z.string().min(1, 'CLOUDFLARE_R2_ACCESS_KEY_ID requerido'),
    CLOUDFLARE_R2_SECRET_ACCESS_KEY: z.string().min(1, 'CLOUDFLARE_R2_SECRET_ACCESS_KEY requerido'),
    CLOUDFLARE_R2_BUCKET: z.string().min(1, 'CLOUDFLARE_R2_BUCKET requerido'),
    CLOUDFLARE_R2_ENDPOINT: z.string().url('CLOUDFLARE_R2_ENDPOINT debe ser una URL válida'),
    CLOUDFLARE_R2_REGION: z.string().optional(),
    CDN_BASE_URL: z.string().url('CDN_BASE_URL debe ser una URL válida'),
  });
// ---------------------------------------------------------------------------
// Upload a Cloudflare R2 (S3-compatible) y salida local
// ---------------------------------------------------------------------------

/**
 * Sube todos los assets + el manifest a Cloudflare R2 de forma ATÓMICA:
 *   1. `assets` (Cache-Control: immutable) — todos antes del manifest.
 *   2. `manifest.json` (Cache-Control: max-age=3600, stale-while-revalidate=60) — al final.
 *
 * Usa `@aws-sdk/client-s3` (R2 es S3-compatible). No loguea credenciales.
 */
export async function uploadToR2(
  assets: DiscoveredAsset[],
  manifest: Manifest,
  env: R2Env,
): Promise<{ uploaded: number; manifestKey: string }> {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

  const client = new S3Client({
    endpoint: env.CLOUDFLARE_R2_ENDPOINT.replace(/\/?$/, ''),
    region: env.CLOUDFLARE_R2_REGION || 'auto',
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID,
      secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    },
  });

  const put = (key: string, body: Buffer, cacheControl: string, contentType: string) =>
    client.send(
      new PutObjectCommand({
        Bucket: env.CLOUDFLARE_R2_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: cacheControl,
      }),
    );

  // 1) Assets (immutable). Todos antes del manifest (build atómico).
  for (const a of assets) {
    await put(a.url, fs.readFileSync(a.absolutePath), CACHE_HEADERS.immutable, a.type);
  }

  // 2) Manifest (al final).
  const manifestKey = 'manifest.json';
  await put(
    manifestKey,
    Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'),
    CACHE_HEADERS.manifest,
    'application/json',
  );

  return { uploaded: assets.length, manifestKey };
}

/**
 * Alternativa cuando no hay credenciales R2: escribe los assets + manifest en un directorio local
 * (`outDir`), conservando la estructura de `url`. Útil para desarrollo/CI.
 */
export async function writeLocalManifest(
  assets: DiscoveredAsset[],
  manifest: Manifest,
  outDir: string,
): Promise<string> {
  for (const a of assets) {
    const dest = path.join(outDir, a.url.split('/').join(path.sep));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(a.absolutePath, dest);
  }
  const manifestPath = path.join(outDir, 'manifest.json');
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  return manifestPath;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main(argv: string[]): Promise<void> {
  const args = new Set(argv);
  const dryRun = args.has('--dry-run');
  const outFlag = argv.indexOf('--out');
  const outDir = outFlag >= 0 ? argv[outFlag + 1] : path.resolve(process.cwd(), 'dist', 'assets');

  const root = process.cwd();
  const discovered = discoverAssets(root);
  if (discovered.length === 0) {
    console.error('[build-assets] No se encontraron assets en shared/ (¿ruta correcta?).');
    process.exit(1);
  }

  const wantsR2 = !dryRun && isR2Configured(process.env as Record<string, string | undefined>);
  let baseUrl = 'https://cdn.petai.app/assets/';
  if (wantsR2) baseUrl = (await validateR2Env(process.env as Record<string, string | undefined>)).CDN_BASE_URL;

  const manifest = buildManifest(discovered, baseUrl);
  console.log(`[build-assets] ${discovered.length} assets detectados. version=${manifest.version}`);

  if (dryRun) {
    console.log('[build-assets] --dry-run: sin upload. Manifest:');
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  if (wantsR2) {
    const env = await validateR2Env(process.env as Record<string, string | undefined>);
    const res = await uploadToR2(discovered, manifest, env);
    console.log(
      `[build-assets] ${res.uploaded} assets subidos a R2 (${env.CLOUDFLARE_R2_BUCKET}); manifest=${res.manifestKey}`,
    );
    return;
  }

  const manifestPath = await writeLocalManifest(discovered, manifest, outDir);
  console.log(`[build-assets] Sin credenciales R2: assets escritos en local -> ${outDir}`);
  console.log(`[build-assets] Manifest local: ${manifestPath}`);
}

/** Solo ejecuta el CLI cuando se importa como script principal (no desde los tests). */
const isMainModule =
  typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module;

if (isMainModule) {
  main(process.argv.slice(2)).catch((err) => {
    console.error('[build-assets] Error:', (err as Error).message);
    process.exit(1);
  });
}
  return schema.parse({
    CLOUDFLARE_R2_ACCESS_KEY_ID: env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    CLOUDFLARE_R2_SECRET_ACCESS_KEY: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    CLOUDFLARE_R2_BUCKET: env.CLOUDFLARE_R2_BUCKET,
    CLOUDFLARE_R2_ENDPOINT: env.CLOUDFLARE_R2_ENDPOINT,
    CLOUDFLARE_R2_REGION: env.CLOUDFLARE_R2_REGION,
    CDN_BASE_URL: env.CDN_BASE_URL,
  }) as R2Env;
}

/**
 * URL versionada relativa al `baseUrl` del CDN para una ruta relativa a `shared/`.
 */
export function toVersionedUrl(relFromShared: string, hash: string): string {
  const posix = relFromShared.split(path.sep).join('/');
  const ext = path.extname(posix);
  const dir = path.posix.dirname(posix);
  const base = path.posix.basename(posix, ext);
  const versioned = versionedName(base, ext, hash);
  const dirPart = dir === '.' ? '' : dir.replace(/^assets\//, '');
  return dirPart ? `${dirPart}/${versioned}` : versioned;
}