/**
 * Tests del AssetLoader (feature 009-edge-cdn, T008).
 *
 * Verifica: `loadAsset(key)` resuelve la URL versionada, deduplica (1 descarga por key), cae a
 * origin una vez ante un 404 del CDN, lanza `AssetNotFound` si origin también falla y usa el
 * fallback embebido como last resort. Usa `MemoryAssetStorage` (sin Tauri/disco).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AssetCache, MemoryAssetStorage } from './asset-cache';
import { AssetLoader, AssetNotFound, type Fetcher, type AssetLoaderOptions } from './asset-loader';

const HASH = 'a3b2f1c9d0e1f204';
const KEY = 'sprites/ignisaur_idle';
const CDN_MANIFEST = 'https://cdn.test/manifest.json';
const ORIGIN_MANIFEST = 'http://origin.test/v1/assets/manifest';
const ORIGIN_BASE = 'http://origin.test/v1/assets';
const CDN_ASSET_URL = 'https://cdn.test/sprites/ignisaur_idle-a3b2f1.svg';

const manifest = {
  version: '2026.11.13-a3b2f1',
  baseUrl: 'https://cdn.test/',
  generatedAt: '2026-11-13T09:00:00.000Z',
  assets: {
    [KEY]: { url: 'sprites/ignisaur_idle-a3b2f1.svg', hash: HASH, type: 'image/svg+xml', size: 3 },
  },
};

interface MockState {
  cdnCalls: number;
  originCalls: number;
  manifestCalls: number;
  cdnStatus: number;
  originStatus: number;
}

function makeFetch(state: MockState): Fetcher {
  const dataResp = () => ({
    ok: true,
    status: 200,
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  });
  const errResp = (status: number) => ({ ok: false, status, arrayBuffer: async () => new ArrayBuffer(0) });
  return (async (url: string) => {
    if (url === CDN_MANIFEST || url === ORIGIN_MANIFEST) {
      state.manifestCalls++;
      return { ok: true, status: 200, json: async () => manifest };
    }
    if (url.startsWith('https://cdn.test/')) {
      state.cdnCalls++;
      return state.cdnStatus === 200 ? dataResp() : errResp(state.cdnStatus);
    }
    if (url.startsWith('http://origin.test/')) {
      state.originCalls++;
      return state.originStatus === 200 ? dataResp() : errResp(state.originStatus);
    }
    return errResp(404);
  }) as unknown as Fetcher;
}

function makeLoader(state: MockState, extra: Partial<AssetLoaderOptions> = {}) {
  const cache = new AssetCache(new MemoryAssetStorage());
  return new AssetLoader(cache, {
    cdnManifestUrl: CDN_MANIFEST,
    originManifestUrl: ORIGIN_MANIFEST,
    originBaseUrl: ORIGIN_BASE,
    fetch: makeFetch(state),
    ...extra,
  });
}

const fresh = (): MockState => ({ cdnCalls: 0, originCalls: 0, manifestCalls: 0, cdnStatus: 200, originStatus: 200 });

describe('AssetLoader.loadAsset', () => {
  let state: MockState;
  beforeEach(() => (state = fresh()));

  it('resuelve la URL versionada (CDN) y devuelve el contenido', async () => {
    const loader = makeLoader(state);
    const blob = await loader.loadAsset(KEY);
    expect(state.cdnCalls).toBe(1);
    expect(state.originCalls).toBe(0);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
    expect(blob.type).toBe('image/svg+xml');
    // resolve() devuelve la URL absoluta del CDN.
    expect(loader.resolve(KEY)).toBe(CDN_ASSET_URL);
  });

  it('cachea localmente: la segunda lectura no hace red (AC2)', async () => {
    const loader = makeLoader(state);
    await loader.loadAsset(KEY);
    expect(state.cdnCalls).toBe(1);
    await loader.loadAsset(KEY); // se sirve desde la cache local
    expect(state.cdnCalls).toBe(1);
    expect(await loader.isCached(KEY)).toBe(true);
  });

  it('deduplica: una descarga por key con peticiones concurrentes', async () => {
    const loader = makeLoader(state);
    await Promise.all([loader.loadAsset(KEY), loader.loadAsset(KEY), loader.loadAsset(KEY)]);
    expect(state.cdnCalls).toBe(1);
  });

  it('cae a origin UNA VEZ ante un 404 del CDN (AC6)', async () => {
    state.cdnStatus = 404;
    state.originStatus = 200;
    const loader = makeLoader(state);
    let misses = 0;
    const l2 = makeLoader(state, { onCdnMiss: () => misses++ });
    await l2.loadAsset(KEY);
    expect(state.cdnCalls).toBe(1);
    expect(state.originCalls).toBe(1); // origin se consulta una única vez
    expect(misses).toBe(1); // onCdnMiss disparado
  });

  it('lanza AssetNotFound si CDN y origin fallan y no hay embebido', async () => {
    state.cdnStatus = 404;
    state.originStatus = 404;
    const loader = makeLoader(state);
    await expect(loader.loadAsset(KEY)).rejects.toBeInstanceOf(AssetNotFound);
    await expect(loader.loadAsset('sprites/ghost_idle')).rejects.toBeInstanceOf(AssetNotFound);
  });

  it('usa el fallback embebido last-resort si CDN y origin fallan', async () => {
    state.cdnStatus = 404;
    state.originStatus = 404;
    const embedded = new Blob(['embedded'], { type: 'image/svg+xml' });
    const loader = makeLoader(state, { embeddedFallback: (k) => (k === KEY ? embedded : null) });
    const blob = await loader.loadAsset(KEY);
    expect(blob).toBe(embedded);
  });
});