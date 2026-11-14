/**
 * Game-data del desktop (feature 009-edge-cdn, T012).
 *
 * Carga los game-data JSON desde el CDN (`game-data/<file>`), valida con el mismo schema zod del
 * backend (Constitución IV) y lo cachea en memoria. Tras el arranque, `get*()` leen de memoria
 * (0 red, SC-005).
 */
import { z } from 'zod';
import { AssetLoader } from './asset-loader';

/**
 * Schema de `balance.json` (subconjunto relevante para el preloader, con `passthrough` para el
 * resto). Mantiene la coherencia con el backend (Constitución IV).
 */
export const balanceSchema = z
  .object({
    version: z.string(),
    leveling: z.object({
      maxLevel: z.number(),
      stages: z.object({
        baby: z.number(),
        juvenile: z.number(),
        adult: z.number(),
        final: z.number(),
      }),
    }),
  })
  .passthrough();

/** Etapas de evolución (umbrales data-driven, p. ej. 1/10/25/50). */
export interface LevelingStages {
  baby: number;
  juvenile: number;
  adult: number;
  final: number;
}

export interface Balance {
  version: string;
  leveling: { maxLevel: number; stages: LevelingStages };
  [key: string]: unknown;
}

export class GameDataClient {
  private readonly cache = new Map<string, unknown>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(private readonly loader: AssetLoader) {}

  /**
   * Carga (una vez) `game-data/<file>` desde el CDN, lo valida con `schema` (si se da) y lo cachea
   * en memoria. Deduplica por `file` (una carga concurrente).
   */
  async load<T = unknown>(file: string, schema?: z.ZodTypeAny): Promise<T> {
    if (this.cache.has(file)) return this.cache.get(file) as T;
    const existing = this.inFlight.get(file);
    if (existing) return existing as Promise<T>;

    const p = (async () => {
      const blob = await this.loader.loadAsset(`game-data/${file}`);
      const text = await blob.text();
      const json = JSON.parse(text);
      const value = schema ? (schema.parse(json) as T) : (json as T);
      this.cache.set(file, value);
      return value;
    })();

    this.inFlight.set(file, p);
    try {
      return await p;
    } finally {
      this.inFlight.delete(file);
    }
  }

  /** Carga y valida `balance.json` (con `balanceSchema`). */
  async loadBalance(): Promise<Balance> {
    return this.load<Balance>('balance', balanceSchema);
  }

  /** Umbrales de etapa de evolución (data-driven; `null` hasta cargar `balance`). */
  getStages(): LevelingStages | null {
    const b = this.cache.get('balance') as Balance | undefined;
    return b?.leveling?.stages ?? null;
  }

  /** Balance en memoria (0 red tras el arranque, SC-005). `null` si aún no se cargó. */
  getBalance(): Balance | null {
    return (this.cache.get('balance') as Balance | undefined) ?? null;
  }

  /** `true` si el game-data ya está en memoria. */
  has(file: string): boolean {
    return this.cache.has(file);
  }
}