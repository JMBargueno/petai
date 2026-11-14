/**
 * Tests del pipeline de assets (`scripts/build-assets.ts`) — feature 009-edge-cdn (T003).
 *
 * Solo prueban las partes "puras" (hashing, descubrimiento, manifest). NO hacen upload real a R2:
 * el upload requiere credenciales y no es parte de esta prueba. Ejecutable con `pnpm test:assets`.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  md5,
  versionedName,
  mimeFor,
  toLogicalKey,
  toVersionedUrl,
  buildManifest,
  discoverAssets,
  isR2Configured,
  validateR2Env,
  CACHE_HEADERS,
} from './build-assets';

let tmpRoot: string;

beforeAll(() => {
  // Fixture herméxico: replica la estructura mínima de `shared/` sin depender de los assets reales.
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'petai-assets-'));
  const assetsDir = path.join(tmpRoot, 'shared', 'assets');
  const gameDataDir = path.join(tmpRoot, 'shared', 'game-data');
  fs.mkdirSync(path.join(assetsDir, 'sprites'), { recursive: true });
  fs.mkdirSync(path.join(assetsDir, 'patterns'), { recursive: true });
  fs.mkdirSync(path.join(assetsDir, 'species', 'ignisaur'), { recursive: true });
  fs.mkdirSync(gameDataDir, { recursive: true });

  fs.writeFileSync(path.join(assetsDir, 'sprites', 'ignisaur_idle.svg'), '<svg></svg>');
  fs.writeFileSync(path.join(assetsDir, 'patterns', 'scales.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  fs.writeFileSync(path.join(assetsDir, 'species', 'ignisaur', 'base.png'), Buffer.from([0x89, 0x50]));
  fs.writeFileSync(path.join(assetsDir, 'species', 'ignisaur', 'mask.png'), Buffer.from([0x89, 0x50]));
  fs.writeFileSync(path.join(assetsDir, 'palettes.json'), JSON.stringify({ fire: {} }));
  fs.writeFileSync(path.join(gameDataDir, 'balance.json'), JSON.stringify({ version: '1.3.0' }));
});

afterAll(() => {
  if (tmpRoot && fs.existsSync(tmpRoot)) fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('build-assets: hashing', () => {
  it('md5 es determinista y coincide con el valor conocido', () => {
    expect(md5('hello')).toBe('5d41402abc4b2a76b9719d911017c592');
    expect(md5(Buffer.from('hello'))).toBe(md5('hello'));
  });

  it('versionedName usa <name>-<hash8>.<ext>', () => {
    expect(versionedName('ignisaur_idle', '.svg', 'a3b2f1c9d0e1f204')).toBe('ignisaur_idle-a3b2f1c9.svg');
  });

  it('mimeFor resuelve los tipos del pipeline', () => {
    expect(mimeFor('.svg')).toBe('image/svg+xml');
    expect(mimeFor('.png')).toBe('image/png');
    expect(mimeFor('.json')).toBe('application/json');
    expect(mimeFor('.xyz')).toBe('application/octet-stream');
  });
});

describe('build-assets: keys y urls', () => {
  it('toLogicalKey conserva la estructura del contrato', () => {
    expect(toLogicalKey('assets/sprites/ignisaur_idle.svg')).toBe('sprites/ignisaur_idle');
    expect(toLogicalKey('assets/patterns/scales.png')).toBe('patterns/scales');
    expect(toLogicalKey('assets/species/ignisaur/base.png')).toBe('species/ignisaur/base');
    expect(toLogicalKey('assets/palettes.json')).toBe('palettes');
    expect(toLogicalKey('game-data/balance.json')).toBe('game-data/balance');
  });

  it('toVersionedUrl versiona el archivo y preserva la ruta relativa', () => {
describe('build-assets: discoverAssets', () => {
  it('descubre sprites, patterns, species y game-data con hash/type/size', () => {
    const assets = discoverAssets(tmpRoot);
    const keys = new Set(assets.map((a) => a.key));
    expect(keys).toEqual(
      new Set([
        'sprites/ignisaur_idle',
        'patterns/scales',
        'species/ignisaur/base',
        'species/ignisaur/mask',
        'palettes',
        'game-data/balance',
      ]),
    );

    const sprite = assets.find((a) => a.key === 'sprites/ignisaur_idle')!;
    expect(sprite.type).toBe('image/svg+xml');
    expect(sprite.url).toMatch(/^sprites\/ignisaur_idle-[0-9a-f]{8}\.svg$/);
    expect(sprite.size).toBeGreaterThan(0);
    expect(sprite.hash).toBe(
      md5(fs.readFileSync(path.join(tmpRoot, 'shared', 'assets', 'sprites', 'ignisaur_idle.svg'))),
    );

    const balance = assets.find((a) => a.key === 'game-data/balance')!;
    expect(balance.type).toBe('application/json');
    expect(balance.url).toMatch(/^game-data\/balance-[0-9a-f]{8}\.json$/);
  });
});

describe('build-assets: manifest', () => {
  it('genera un manifest con la forma del contrato y una version estable', () => {
    const assets = discoverAssets(tmpRoot);
    const fixedDate = new Date('2026-11-13T09:00:00.000Z');
    const m1 = buildManifest(assets, 'https://cdn.petai.app/assets', fixedDate);
    const m2 = buildManifest(assets, 'https://cdn.petai.app/assets/', fixedDate);

    expect(m1.version).toMatch(/^\d{4}\.\d{2}\.\d{2}-[0-9a-f]{8}$/);
    expect(m1.baseUrl).toBe('https://cdn.petai.app/assets/'); // se normaliza con "/" final
    expect(m2.baseUrl).toBe(m1.baseUrl);
    expect(m1.version).toBe(m2.version); // idempotente para el mismo contenido/fecha
    expect(m1.generatedAt).toBe(fixedDate.toISOString());

    for (const [key, entry] of Object.entries(m1.assets)) {
      expect(entry.hash).toMatch(/^[0-9a-f]{32}$/);
      expect(typeof entry.type).toBe('string');
      expect(typeof entry.size).toBe('number');
      expect(entry.url).toContain('-');
      // El `url` debe empezar por el prefijo de carpeta de la `key` (p. ej. `sprites/`, `game-data/`).
      const prefix = key.includes('/') ? key.split('/')[0] + '/' : '';
      expect(entry.url.startsWith(prefix)).toBe(true);
    }
  });

  it('la version cambia cuando el contenido de un asset cambia', () => {
    const a = discoverAssets(tmpRoot);
    const v1 = buildManifest(a, 'https://cdn.test/', new Date('2026-01-01T00:00:00Z')).version;
    // Mutar un asset en el fixture ⇒ hash distinto ⇒ digest distinto.
    const target = path.join(tmpRoot, 'shared', 'assets', 'sprites', 'ignisaur_idle.svg');
    fs.writeFileSync(target, '<svg>changed</svg>');
    const v2 = buildManifest(discoverAssets(tmpRoot), 'https://cdn.test/', new Date('2026-01-01T00:00:00Z')).version;
    expect(v2).not.toBe(v1);
  });
});

describe('build-assets: cabeceras y env R2', () => {
  it('expone las cabeceras de caché del contrato', () => {
    expect(CACHE_HEADERS.immutable).toBe('public, max-age=31536000, immutable');
    expect(CACHE_HEADERS.manifest).toBe('public, max-age=3600, stale-while-revalidate=60');
  });

  it('isR2Configured requiere las 5 variables', () => {
    expect(isR2Configured({})).toBe(false);
    expect(
      isR2Configured({
        CLOUDFLARE_R2_ACCESS_KEY_ID: 'a',
        CLOUDFLARE_R2_SECRET_ACCESS_KEY: 'b',
        CLOUDFLARE_R2_BUCKET: 'c',
        CLOUDFLARE_R2_ENDPOINT: 'https://x.r2.cloudflarestorage.com',
        CDN_BASE_URL: 'https://cdn.petai.app/assets',
      }),
    ).toBe(true);
  });

  it('validateR2Env valida con zod (endpoint/CDN deben ser URL) y lanza si no', async () => {
    const good = {
      CLOUDFLARE_R2_ACCESS_KEY_ID: 'id',
      CLOUDFLARE_R2_SECRET_ACCESS_KEY: 'secret',
      CLOUDFLARE_R2_BUCKET: 'bucket',
      CLOUDFLARE_R2_ENDPOINT: 'https://acct.r2.cloudflarestorage.com',
      CDN_BASE_URL: 'https://cdn.petai.app/assets',
    };
    await expect(validateR2Env(good)).resolves.toMatchObject({ CDN_BASE_URL: good.CDN_BASE_URL });
    await expect(validateR2Env({ ...good, CLOUDFLARE_R2_ENDPOINT: 'no-url' })).rejects.toThrow();
  });
});
    expect(toVersionedUrl('assets/sprites/ignisaur_idle.svg', 'a3b2f1c9')).toBe(
      'sprites/ignisaur_idle-a3b2f1c9.svg',
    );
    expect(toVersionedUrl('assets/species/ignisaur/base.png', 'b1b2b3b4')).toBe(
      'species/ignisaur/base-b1b2b3b4.png',
    );
    expect(toVersionedUrl('game-data/balance.json', 'c5c6c7c8')).toBe('game-data/balance-c5c6c7c8.json');
  });
});