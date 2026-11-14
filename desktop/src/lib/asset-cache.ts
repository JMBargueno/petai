/**
 * Cache local de assets del desktop (feature 009-edge-cdn, T010).
 *
 * Guarda los assets descargados en disco (`~/.petai/assets/`) indexados por su `hash` (nombre
 * versionado ⇒ contenido inmutable). El backend de almacenamiento es inyectable:
 *   - `MemoryAssetStorage`  → en memoria (tests / last resort sin Tauri).
 *   - `TauriAssetStorage`   → disco vía `@tauri-apps/plugin-fs` (producción, ver `asset-cache-tauri.ts`).
 *
 * La caché solo expone operaciones por `hash` (get/set/exists/prune): el `AssetLoader` resuelve la
 * `key` → `hash` antes de llamar aquí.
 */

/** Backend de almacenamiento de blobs, inyectable en `AssetCache`. */
export interface AssetStorageBackend {
  /** Lee el blob guardado para `hash`. `null` si no existe. */
  read(hash: string): Promise<Uint8Array | null>;
  /** Escribe (o sobrescribe) el blob para `hash`. */
  write(hash: string, data: Uint8Array): Promise<void>;
  /** `true` si hay un blob para `hash`. */
  exists(hash: string): Promise<boolean>;
  /** Elimina el blob de `hash` (no-op si no existe). */
  remove(hash: string): Promise<void>;
  /** Lista los `hash` guardados (para `prune`). */
  list(): Promise<string[]>;
}

/** Backend en memoria (determinista y sin dependencias: tests y last resort). */
export class MemoryAssetStorage implements AssetStorageBackend {
  private readonly store = new Map<string, Uint8Array>();

  async read(hash: string): Promise<Uint8Array | null> {
    return this.store.get(hash) ?? null;
  }
  async write(hash: string, data: Uint8Array): Promise<void> {
    this.store.set(hash, data);
  }
  async exists(hash: string): Promise<boolean> {
    return this.store.has(hash);
  }
  async remove(hash: string): Promise<void> {
    this.store.delete(hash);
  }
  async list(): Promise<string[]> {
    return [...this.store.keys()];
  }
}

/**
 * Cache local de assets indexada por `hash`. Envuelve un `AssetStorageBackend` y convierte entre
 * `Blob` (web) y `Uint8Array` (backend de almacenamiento).
 */
export class AssetCache {
  constructor(private readonly backend: AssetStorageBackend) {}

  /** Devuelve el blob en caché para `hash` (o `null`). */
  async get(hash: string): Promise<Blob | null> {
    const data = await this.backend.read(hash);
    if (!data) return null;
    return toBlob(data);
  }

  /** Guarda el blob en caché bajo `hash`. */
  async set(hash: string, blob: Blob): Promise<void> {
    await this.backend.write(hash, await toBytes(blob));
  }

  /** `true` si el asset (por `hash`) ya está en caché. */
  async exists(hash: string): Promise<boolean> {
    return this.backend.exists(hash);
  }

  /**
   * Elimina del caché local los `hash` que NO están en `keepHashes`. `keepHashes` suele ser el set
   * de hashes del manifest vigente: tras un re-deploy, los assets obsoletos se descartan.
   */
  async prune(keepHashes: Set<string>): Promise<number> {
    let removed = 0;
    for (const hash of await this.backend.list()) {
      if (!keepHashes.has(hash)) {
        await this.backend.remove(hash);
        removed++;
      }
    }
    return removed;
  }
}

/** Construye una `AssetCache` con el backend en memoria (tests/last resort). */
export function createMemoryAssetCache(): AssetCache {
  return new AssetCache(new MemoryAssetStorage());
}

// --- utilidades Blob <-> Uint8Array (sin dependencias de Tauri) ---

async function toBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer());
  }
  return new Uint8Array(await (blob as any).buffer());
}

function toBlob(bytes: Uint8Array): Blob {
  // `Blob` está disponible en el webview de Tauri y en Node ≥ 18.
  return new Blob([bytes as any], { type: 'application/octet-stream' });
}