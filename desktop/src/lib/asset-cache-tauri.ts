/**
 * Backend de almacenamiento en disco para `AssetCache` (feature 009-edge-cdn).
 *
 * Usa `@tauri-apps/plugin-fs` para guardar los assets en `~/.petai/assets/<hash>` (app data dir).
 * Solo se importa desde la app (no desde los tests), que usan `createMemoryAssetCache()`.
 *
 * NOTA: el plugin de fs de Tauri requiere declarar el scope del app data dir en
 * `src-tauri/tauri.conf.json` (`app.security.fs.scope`) para que las lecturas/escrituras estén
 * permitidas.
 */
import { readBinaryFile, writeBinaryFile, exists, remove, readDir } from '@tauri-apps/plugin-fs';
import { appDataDir } from '@tauri-apps/api/path';
import { join } from '@tauri-apps/api/path';
import { AssetCache, type AssetStorageBackend } from './asset-cache';

/** Nombre del directorio de app data de PetAI (Tauri app identifier). */
const APP_ID = 'app.dev.petai.desktop';
/** Subdirectorio donde se guardan los assets. */
const SUBDIR = 'assets';

/**
 * `AssetStorageBackend` sobre el disco (Tauri fs). Guarda cada asset como un archivo `<hash>` bajo
 * el app data dir.
 */
export class TauriAssetStorage implements AssetStorageBackend {
  private baseDir: string | null = null;

  private async base(): Promise<string> {
    if (!this.baseDir) {
      const appDir = await appDataDir(APP_ID);
      this.baseDir = join(appDir, SUBDIR);
    }
    return this.baseDir;
  }

  private file(hash: string): string {
    // `hash` ya es una cadena segura (hex), pero se sanitiza por si acaso.
    const safe = hash.replace(/[^a-zA-Z0-9._-]/g, '_');
    return join(this.baseDir ?? `/${SUBDIR}`, safe);
  }

  async read(hash: string): Promise<Uint8Array | null> {
    try {
      const data = await readBinaryFile(this.file(hash));
      return new Uint8Array(data);
    } catch {
      return null;
    }
  }

  async write(hash: string, data: Uint8Array): Promise<void> {
    const path = this.file(hash);
    await writeBinaryFile(path, data);
  }

  async exists(hash: string): Promise<boolean> {
    try {
      return await exists(this.file(hash));
    } catch {
      return false;
    }
  }

  async remove(hash: string): Promise<void> {
    try {
      await remove(this.file(hash));
    } catch {
      /* no-op */
    }
  }

  async list(): Promise<string[]> {
    try {
      const base = await this.base();
      const entries = await readDir(base);
      return entries.filter((e) => e.isFile).map((e) => e.name);
    } catch {
      return [];
    }
  }
}

/** Construye la `AssetCache` del desktop backed por disco (Tauri fs). */
export function createTauriAssetCache(): AssetCache {
  return new AssetCache(new TauriAssetStorage());
}