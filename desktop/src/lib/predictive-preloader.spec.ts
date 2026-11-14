/**
 * Tests del PredictivePreloader (feature 009-edge-cdn, T014).
 *
 * Verifica: nivel 8 → pre-carga `juvenile`, 24 → `adult`, 49 → `final`; evento <2h → `assetPrefix`;
 * no pre-carga fuera de la especie actual + próxima etapa; y 100 preloads con concurrencia limitada.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { AssetCache, MemoryAssetStorage } from './asset-cache';
import { AssetLoader, type Fetcher, type Manifest, type Asset } from './asset-loader';
import { PredictivePreloader } from './predictive-preloader';

const CDN_MANIFEST = 'https://cdn.test/manifest.json';
const STAGES = { baby: 1, juvenile: 10, adult: 25, final: 50 };
const hashOf = (s: string) => createHash('md5').update(s).digest('hex');
const extOf = (k: string) => (k.endsWith('.json') ? '.json' : '.svg');

function buildManifest(keys: string[]): Manifest {
  const assets: Record<string, Asset> = {};
  for (const k of keys) {
    const h = hashOf(k);
    const base = k.split('/').pop() ?? k;
    const dir = k.includes('/') ? k.split('/').slice(0, -1).join('/') : '';
    assets[k] = {
      url: `${dir ? dir + '/' : ''}${base}-${h.slice(0, 8)}${extOf(k)}`,
      hash: h,
      type: k.endsWith('.json') ? 'application/json' : 'image/svg+xml',
      size: 3,
    };
  }
  return { version: 'v', baseUrl: 'https://cdn.test/', generatedAt: '', assets };
}

function makeLoader(
  manifest: Manifest,
  hooks?: { onAssetStart?: () => void },
) {
  let inFlight = 0;
  let maxInFlight = 0;
  const fetch: Fetcher = (async (url: string) => {
    if (url === CDN_MANIFEST) return { ok: true, status: 200, json: async () => manifest } as unknown as Response;
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    hooks?.onAssetStart?.();
    await new Promise((r) => setTimeout(r, 2));
    inFlight--;
    return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1]).buffer } as unknown as Response;
  }) as unknown as Fetcher;
  const loader = new AssetLoader(new AssetCache(new MemoryAssetStorage()), {
    cdnManifestUrl: CDN_MANIFEST,
    originBaseUrl: 'http://origin.test/v1/assets',
    fetch,
  });
  return { loader, getMaxInFlight: () => maxInFlight };
}

const makePreloader = (loader: AssetLoader, extra: ConstructorParameters<typeof PredictivePreloader>[2] = {}) =>
  new PredictivePreloader(loader, STAGES as never, extra);

describe('PredictivePreloader.evaluate (etapas data-driven)', () => {
  it('nivel 8 → pre-carga juvenile', () => {
    const { loader } = makeLoader(buildManifest(['sprites/ignisaur_idle']));
    const d = makePreloader(loader).evaluate({ speciesId: 'ignisaur', stage: 'baby', level: 8 });
    expect(d).toHaveLength(1);
    expect(d[0].stage).toBe('juvenile');
    expect(d[0].priority).toBe('low');
    expect(d[0].keys).toEqual([
      'sprites/ignisaur_idle',
      'sprites/ignisaur_eat',
      'sprites/ignisaur_happy',
      'sprites/ignisaur_sleep',
    ]);
  });

  it('nivel 24 → pre-carga adult', () => {
    const { loader } = makeLoader(buildManifest(['sprites/ignisaur_idle']));
    expect(makePreloader(loader).evaluate({ speciesId: 'ignisaur', stage: 'juvenile', level: 24 })[0].stage).toBe('adult');
  });

  it('nivel 49 → pre-carga final', () => {
    const { loader } = makeLoader(buildManifest(['sprites/ignisaur_idle']));
    expect(makePreloader(loader).evaluate({ speciesId: 'ignisaur', stage: 'adult', level: 49 })[0].stage).toBe('final');
  });

  it('nivel ≥ final → no pre-carga (etapa final alcanzada)', () => {
    const { loader } = makeLoader(buildManifest(['sprites/ignisaur_idle']));
    expect(makePreloader(loader).evaluate({ speciesId: 'ignisaur', stage: 'final', level: 60 })).toEqual([]);
  });
describe('PredictivePreloader.enqueueEvent (ventana 2h)', () => {
  it('evento <2h con assetPrefix → decision con las keys del prefijo', async () => {
    const manifest = buildManifest(['event/winter2026/snow', 'event/winter2026/flakes', 'sprites/ignisaur_idle']);
    const { loader } = makeLoader(manifest);
    await loader.init();
    const now = Date.now();
    const pre = makePreloader(loader, { now: () => now });
    const decision = await pre.enqueueEvent({
      startsAt: new Date(now + 1 * 3600 * 1000).toISOString(),
      assetPrefix: 'event/winter2026/',
    });
    expect(decision).not.toBeNull();
    expect(decision!.keys).toEqual(['event/winter2026/snow', 'event/winter2026/flakes']);
  });

  it('evento >2h → no pre-carga (null)', async () => {
    const manifest = buildManifest(['event/winter2026/snow']);
    const { loader } = makeLoader(manifest);
    await loader.init();
    const now = Date.now();
    const pre = makePreloader(loader, { now: () => now });
    expect(
      await pre.enqueueEvent({ startsAt: new Date(now + 3 * 3600 * 1000).toISOString(), assetPrefix: 'event/winter2026/' }),
    ).toBeNull();
  });

  it('evento sin assetPrefix → null', async () => {
    const manifest = buildManifest(['sprites/ignisaur_idle']);
    const { loader } = makeLoader(manifest);
    await loader.init();
    const pre = makePreloader(loader);
    expect(await pre.enqueueEvent({ startsAt: new Date().toISOString(), assetPrefix: null })).toBeNull();
  });
});

describe('PredictivePreloader.execute (concurrencia + dedup)', () => {
  it('100 preloads con concurrencia limitada (≤3 en vuelo)', async () => {
    const keys = Array.from({ length: 100 }, (_, i) => `ev/sprite_${i}`);
    const { loader, getMaxInFlight } = makeLoader(buildManifest(keys));
    await loader.init();
    const pre = makePreloader(loader, { concurrency: 3 });
    const result = await pre.execute([{ keys, priority: 'low' }]);
    expect(result.loaded).toBe(100);
    expect(getMaxInFlight()).toBeLessThanOrEqual(3);
    expect(getMaxInFlight()).toBeGreaterThanOrEqual(1);
  });

  it('deduplica: no re-descarga lo que ya está en caché', async () => {
    const keys = ['ev/a', 'ev/b', 'ev/c'];
    const { loader } = makeLoader(buildManifest(keys));
    await loader.init();
    const pre = makePreloader(loader);
    const first = await pre.execute([{ keys, priority: 'low' }]);
    expect(first.loaded).toBe(3);
    const second = await pre.execute([{ keys, priority: 'low' }]);
    expect(second.loaded).toBe(0);
    expect(second.skipped).toBe(3);
  });
});

  it('solo pre-carga la próxima etapa de la especie actual (no todas)', () => {
    const { loader } = makeLoader(buildManifest(['sprites/ignisaur_idle']));
    const d = makePreloader(loader).evaluate({ speciesId: 'ignisaur', stage: 'baby', level: 8 });
    // Una única decisión (la etapa inmediata), y todas las keys son de la especie actual.
    expect(d).toHaveLength(1);
    for (const k of d[0].keys) expect(k).toMatch(/^sprites\/ignisaur_/);
  });
});