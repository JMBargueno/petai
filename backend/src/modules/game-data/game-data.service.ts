import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  FieldError,
  GameDataBundle,
  GameDataFileKey,
  GAME_DATA_FILES,
  validateFile,
  validateGameData,
} from './game-data.schemas';

/**
 * Snapshot inmutable de game-data en memoria. El `GameDataService` mantiene UN snapshot vigente y
 * lo reemplaza de forma atómica (una sola asignación de referencia) cuando `reload()` valida un
 * cambio. Los lectores siempre ven un snapshot completo y coherente (o el anterior, si el nuevo
 * fue rechazado).
 */
export interface GameDataSnapshot {
  balance: any;
  species: any[];
  patterns: any[];
  foods: any[];
  skills: any[];
  missions: any | null;
  /** Festividades (feature ambiental). Se carga de `festivals.json` (opcional) y no entra en el hot-reload. */
  festivals: any[];
  /** ISO de cuando el snapshot se construyó/actualizó. */
  loadedAt: string;
  /** Origen del último cambio aplicado: `disk` (watcher/arranque) o `inline` (hot-reload inline). */
  source: 'disk' | 'inline';
}

export type ReloadResult =
  | { ok: true; file: GameDataFileKey; version?: string; changedFields: string[] }
  | { ok: false; file: GameDataFileKey; errors: FieldError[] };

/**
 * Type guard del resultado de `reload`. Con `strictNullChecks: false` TypeScript no hace narrowing
 * de unions discriminadas por `result.ok`, así que se usa este predicado de tipo explícito.
 */
export function isReloadError(result: ReloadResult): result is Extract<ReloadResult, { ok: false }> {
  return !result.ok;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Recorre dos valores y devuelve las rutas (dot-path) de los campos que cambiaron. */
function collectChangedPaths(oldVal: unknown, newVal: unknown, prefix = ''): string[] {
  if (oldVal === newVal) return [];
  if (!(isPlainObject(oldVal) && isPlainObject(newVal))) {
    return JSON.stringify(oldVal) !== JSON.stringify(newVal) ? (prefix ? [prefix] : ['<root>']) : [];
  }
  const keys = new Set([...Object.keys(oldVal), ...Object.keys(newVal)]);
  const paths: string[] = [];
  for (const key of keys) {
    paths.push(...collectChangedPaths(oldVal[key], newVal[key], prefix ? `${prefix}.${key}` : key));
  }
  return paths;
}

@Injectable()
export class GameDataService implements OnModuleInit {
  private readonly logger = new Logger(GameDataService.name);
  private snapshot!: GameDataSnapshot;
  private dataDir!: string;

  onModuleInit() {
    this.dataDir = this.resolveDataDir();
    this.snapshot = this.buildSnapshotFromDisk('disk');
    this.logger.log(
      `Game-data cargado desde ${this.dataDir} (${this.snapshot.species?.length ?? 0} especies, ${this.snapshot.skills?.length ?? 0} habilidades)`,
    );
  }

  /** Resuelve el directorio `shared/game-data` (mismas candidatas que el script de validación). */
  private resolveDataDir(): string {
    const candidates = [
      path.resolve(process.cwd(), 'shared/game-data'),
      path.resolve(process.cwd(), '../shared/game-data'),
      path.resolve(__dirname, '../../../../shared/game-data'),
      path.resolve(__dirname, '../../../shared/game-data'),
    ];
    const dataDir = candidates.find((dir) => fs.existsSync(dir)) || candidates[0];
    return dataDir;
  }

  /** Ruta absoluta del archivo de game data dado su clave. */
  getFilePath(file: string): string {
    return path.join(this.dataDir, `${file}.json`);
  }

  /** Directorio de los game-data (lo usa el watcher y el hot-reload desde disco). */
  getDataDir(): string {
    return this.dataDir;
  }

  /** Lee y parsea un archivo de disco. `null` si no existe. */
  readFileFromDisk(file: string): unknown | null {
    const filePath = this.getFilePath(file);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  private buildSnapshotFromDisk(source: GameDataSnapshot['source']): GameDataSnapshot {
    const read = (file: string, required: boolean): unknown => {
      const value = this.readFileFromDisk(file);
      if (value === null) {
        if (required) throw new Error(`No se encontró ${file}.json en ${this.dataDir}`);
        return null;
      }
      return value;
    };
    return {
      balance: read('balance', true) as any,
      species: (read('species', true) as any[]) ?? [],
      patterns: (read('patterns', true) as any[]) ?? [],
      foods: (read('foods', true) as any[]) ?? [],
      skills: (read('skills', true) as any[]) ?? [],
      missions: (read('missions', false) as any) ?? null,
      // `festivals` NO es un archivo de hot-reload (no está en GAME_DATA_FILES): se lee directo del disco.
      festivals: (() => {
        const p = path.join(this.dataDir, 'festivals.json');
        return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, 'utf8')) as any[]) ?? [] : [];
      })(),
      loadedAt: new Date().toISOString(),
      source,
    };
  }

  // ---------- Lectores (snapshot vigente) ----------

  getBalance() {
    return this.snapshot.balance;
  }

  getSpecies() {
    return this.snapshot.species ?? [];
  }

  getPatterns() {
    return this.snapshot.patterns ?? [];
  }

  getFoods() {
    return this.snapshot.foods ?? [];
  }

  getSkills() {
    return this.snapshot.skills ?? [];
  }

  getMissions() {
    return this.snapshot.missions ?? null;
  }

  /** Festividades (feature ambiental): `festivals.json` (opcional, por defecto []). */
  getFestivals() {
    return this.snapshot.festivals ?? [];
  }

  /** Catálogo de juego (los 6 game-data gestionados). Lo sirve el endpoint público `/catalog`. */
  getCatalog() {
    return {
      balance: this.snapshot.balance,
      species: this.snapshot.species,
      patterns: this.snapshot.patterns,
      foods: this.snapshot.foods,
      skills: this.snapshot.skills,
      missions: this.snapshot.missions ?? null,
    };
  }

  /** Snapshot completo vigente (incluye `loadedAt` y `source`). Lo sirve `GET /dev/game-data`. */
  getSnapshot(): GameDataSnapshot {
    return this.snapshot;
  }

  // ---------- Hot-reload ----------

  /**
   * Aplica un cambio de game data de forma ATÓMICA:
   *  1. Valida el archivo nuevo con su schema zod (`validateFile`).
   *  2. Valida la integridad cruzada del snapshot resultante (`validateGameData`).
   *  3. Si todo es válido, reemplaza `this.snapshot` con un snapshot nuevo (una sola asignación
   *     ⇒ los lectores ven o el snapshot anterior o el nuevo, nunca una mezcla).
   *
   * Si la validación falla en cualquier punto, el snapshot en memoria NO cambia y se devuelven
   * los errores.
   */
  reload(file: GameDataFileKey, data: unknown, source: GameDataSnapshot['source'] = 'disk'): ReloadResult {
    if (!GAME_DATA_FILES.includes(file)) {
      return { ok: false, file, errors: [{ path: '<root>', message: `Archivo de game-data desconocido: ${String(file)}` }] };
    }

    const fileCheck = validateFile(file, data);
    if (!fileCheck.ok) {
      return { ok: false, file, errors: fileCheck.errors };
    }

    // Snapshot resultante de aplicar SOLO el archivo `file` (el resto conserva el snapshot vigente).
    const merged: GameDataBundle = {
      balance: file === 'balance' ? (fileCheck.data as any) : this.snapshot.balance,
      species: file === 'species' ? (fileCheck.data as any[]) : this.snapshot.species,
      patterns: file === 'patterns' ? (fileCheck.data as any[]) : this.snapshot.patterns,
      foods: file === 'foods' ? (fileCheck.data as any[]) : this.snapshot.foods,
      skills: file === 'skills' ? (fileCheck.data as any[]) : this.snapshot.skills,
      missions: file === 'missions' ? (fileCheck.data as any) : this.snapshot.missions,
    };
    const crossErrors = validateGameData(merged);
    if (crossErrors.length > 0) {
      return { ok: false, file, errors: crossErrors.map((message) => ({ path: '<cross-ref>', message })) };
    }

    const changedFields = collectChangedPaths(this.snapshot[file], fileCheck.data);
    const version =
      (file === 'balance' || file === 'missions') && typeof (fileCheck.data as any)?.version === 'string'
        ? ((fileCheck.data as any).version as string)
        : undefined;

    // ATOMIC SWAP: una única asignación de referencia.
    this.snapshot = {
      ...this.snapshot,
      [file]: fileCheck.data,
      loadedAt: new Date().toISOString(),
      source,
    };

    return { ok: true, file, version, changedFields };
  }
}
