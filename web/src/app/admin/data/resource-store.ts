import { signal } from '@angular/core';
import type { Entity } from './models';
import type { Repository } from './repository';

/** Estado de una pantalla de listado: filas, carga y error, sobre un repositorio cualquiera. */
export class ResourceStore<T extends Entity> {
  private readonly _rows = signal<T[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly rows = this._rows.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  constructor(private readonly repo: Repository<T>) {}

  load() {
    return this.run(async () => this._rows.set(await this.repo.list()));
  }

  create(entity: T) {
    return this.run(async () => {
      const created = await this.repo.create(entity);
      this._rows.update((rows) => [created, ...rows]);
    });
  }

  update(id: string, patch: Partial<T>) {
    return this.run(async () => {
      const updated = await this.repo.update(id, patch);
      this._rows.update((rows) => rows.map((r) => (r.id === id ? updated : r)));
    });
  }

  remove(id: string) {
    return this.run(async () => {
      await this.repo.remove(id);
      this._rows.update((rows) => rows.filter((r) => r.id !== id));
    });
  }

  /** Devuelve true si la operación terminó bien; si no, deja el mensaje en `error`. */
  private async run(task: () => Promise<void>): Promise<boolean> {
    this._loading.set(true);
    this._error.set(null);
    try {
      await task();
      return true;
    } catch (e) {
      this._error.set(e instanceof Error ? e.message : 'Error inesperado');
      return false;
    } finally {
      this._loading.set(false);
    }
  }
}
