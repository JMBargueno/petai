/**
 * Tests del GameDataClient (feature 009-edge-cdn, T009).
 *
 * Verifica: carga el game-data desde el CDN, lo valida con zod (mismo criterio que el backend) y lo
 * cachea en memoria (0 red tras el arranque, SC-005). Los datos inválidos se rechazan.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AssetCache, MemoryAssetStorage } from './asset-cache';
import { AssetLoader, type Fetcher } from './asset-loader';
import { GameDataClient, balanceSchema } from './game-data.client';

const HASH = '9c2e4d0a1b3c5d7f';
const KEY = 'game-data/balance';
const CDN_MANIFEST = 'https://cdn.test/manifest.json';

const balance = {
  version: '1.3.0',
  leveling: { maxLevel: 100, stages: { baby: 1, juvenile: 10, adult: 25, final: 50 } },
  rarity: { normal: { probability: 0.6 } },
};

const manifest = {
  version: 'v',
  baseUrl: 'https://cdn.test/',
  generatedAt: '',
  assets: {
    [KEY]: { url: 'game-data/balance-9c2e4d0a.json', hash: HASH, type: 'application/json', size: 10 },
  },
};

interface State {
  assetCalls: number;
  body: string;
  ok: boolean;
}

function makeLoader(state: State): AssetLoader {
  const fetch: Fetcher = (async (url: string) => {
    if (url === CDN_MANIFEST) {
      return { ok: true, status: 200, json: async () => manifest } as unknown as Response;
    }
    state.assetCalls++;
    if (!state.ok) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response;
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => new TextEncoder().encode(state.body).buffer,
    } as unknown as Response;
  }) as unknown as Fetcher;

  const cache = new AssetCache(new MemoryAssetStorage());
  return new AssetLoader(cache, {
    cdnManifestUrl: CDN_MANIFEST,
    originBaseUrl: 'http://origin.test/v1/assets',
    fetch,
  });
}

describe('GameDataClient', () => {
  let state: State;
  beforeEach(() => (state = { assetCalls: 0, body: JSON.stringify(balance), ok: true }));

  it('carga el game-data desde el CDN y lo valida (zod)', async () => {
    const client = new GameDataClient(makeLoader(state));
    const b = await client.loadBalance();
    expect(state.assetCalls).toBe(1);
    expect(b.version).toBe('1.3.0');
    expect(b.leveling.stages).toEqual({ baby: 1, juvenile: 10, adult: 25, final: 50 });
    // El schema de balance acepta el contenido (passthrough).
    expect(() => balanceSchema.parse(balance)).not.toThrow();
  });

  it('cachea en memoria: getBalance() no vuelve a hacer red (SC-005)', async () => {
    const client = new GameDataClient(makeLoader(state));
    await client.loadBalance();
    expect(state.assetCalls).toBe(1);
    const again = client.getBalance();
    expect(state.assetCalls).toBe(1); // 0 red adicional
    expect(again?.version).toBe('1.3.0');
    expect(client.has('balance')).toBe(true);
    expect(client.getStages()).toEqual({ baby: 1, juvenile: 10, adult: 25, final: 50 });
  });

  it('rechaza el game-data que no pasa el schema zod', async () => {
    state.body = JSON.stringify({ version: '1.3.0' }); // sin `leveling.stages`
    const client = new GameDataClient(makeLoader(state));
    await expect(client.loadBalance()).rejects.toThrow();
    expect(client.getBalance()).toBeNull();
  });

  it('rechaza si el CDN devuelve 404 (asset no disponible)', async () => {
    state.ok = false;
    const client = new GameDataClient(makeLoader(state));
    await expect(client.loadBalance()).rejects.toThrow();
  });
});