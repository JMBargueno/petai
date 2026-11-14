import { InjectionToken, inject } from '@angular/core';
import { AuditLog } from './audit-log';
import type { AdminUser, CatalogItem, Entity, GameEvent, PetEntry, SpeciesEntry } from './models';
import { seedEvents, seedItems, seedPets, seedSpecies, seedUsers } from './seed';
import { MOCK_STORAGE } from './storage';

/**
 * Contrato de acceso a datos del panel. Las pantallas solo conocen esta interfaz:
 * para conectar el backend basta con escribir una implementación HTTP y cambiar
 * la `factory` del token correspondiente.
 */
export interface Repository<T extends Entity> {
  list(): Promise<T[]>;
  create(entity: T): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  remove(id: string): Promise<void>;
  /** Vuelve a los datos de partida. */
  reset(): Promise<void>;
}

const wait = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

/** Implementación en memoria + localStorage, con latencia simulada. No hace ninguna petición de red. */
export class MockRepository<T extends Entity> implements Repository<T> {
  private readonly key: string;

  constructor(
    private readonly resource: string,
    private readonly seed: () => T[],
    private readonly describe: (entity: T) => string,
    private readonly storage: Storage,
    private readonly audit?: Pick<AuditLog, 'record'>,
    private readonly latencyMs = 120,
  ) {
    this.key = `pockai.admin.${resource}`;
  }

  async list(): Promise<T[]> {
    await wait(this.latencyMs);
    return this.read();
  }

  async create(entity: T): Promise<T> {
    await wait(this.latencyMs);
    const rows = this.read();
    if (rows.some((r) => r.id === entity.id)) throw new Error(`Ya existe un registro con id "${entity.id}"`);
    this.write([entity, ...rows]);
    this.audit?.record('Alta', this.resource, this.describe(entity));
    return entity;
  }

  async update(id: string, patch: Partial<T>): Promise<T> {
    await wait(this.latencyMs);
    const rows = this.read();
    const index = rows.findIndex((r) => r.id === id);
    if (index < 0) throw new Error(`No existe el registro "${id}"`);
    const updated = { ...rows[index], ...patch, id };
    rows[index] = updated;
    this.write(rows);
    const fields = Object.keys(patch).filter((k) => k !== 'id').join(', ');
    this.audit?.record('Cambio', this.resource, `${this.describe(updated)} (${fields})`);
    return updated;
  }

  async remove(id: string): Promise<void> {
    await wait(this.latencyMs);
    const rows = this.read();
    const target = rows.find((r) => r.id === id);
    if (!target) return;
    this.write(rows.filter((r) => r.id !== id));
    this.audit?.record('Baja', this.resource, this.describe(target));
  }

  async reset(): Promise<void> {
    this.storage.removeItem(this.key);
  }

  private read(): T[] {
    const raw = this.storage.getItem(this.key);
    if (raw) {
      try {
        return JSON.parse(raw) as T[];
      } catch {
        // Datos corruptos: se descartan y se vuelve a la semilla.
      }
    }
    return this.seed();
  }

  private write(rows: T[]) {
    this.storage.setItem(this.key, JSON.stringify(rows));
  }
}

function mock<T extends Entity>(resource: string, seed: () => T[], describe: (e: T) => string) {
  return () => new MockRepository<T>(resource, seed, describe, inject(MOCK_STORAGE), inject(AuditLog));
}

export const ITEMS = new InjectionToken<Repository<CatalogItem>>('ITEMS', {
  providedIn: 'root',
  factory: mock('precios', seedItems, (e) => e.name),
});
export const EVENTS = new InjectionToken<Repository<GameEvent>>('EVENTS', {
  providedIn: 'root',
  factory: mock('eventos', seedEvents, (e) => e.name),
});
export const USERS = new InjectionToken<Repository<AdminUser>>('USERS', {
  providedIn: 'root',
  factory: mock('usuarios', seedUsers, (e) => e.email),
});
export const SPECIES = new InjectionToken<Repository<SpeciesEntry>>('SPECIES', {
  providedIn: 'root',
  factory: mock('especies', seedSpecies, (e) => e.name),
});
export const PETS = new InjectionToken<Repository<PetEntry>>('PETS', {
  providedIn: 'root',
  factory: mock('pockais', seedPets, (e) => e.nickname),
});

export const ALL_REPOSITORIES = [ITEMS, EVENTS, USERS, SPECIES, PETS] as const;
