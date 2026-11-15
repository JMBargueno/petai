import type { Entity } from './models';

/**
 * Contrato de acceso a datos de una pantalla de listado. Las pantallas solo conocen esta interfaz;
 * las operaciones que un recurso no admite lanzan un error con el motivo.
 */
export interface Repository<T extends Entity> {
  list(): Promise<T[]>;
  create(entity: T): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  remove(id: string): Promise<void>;
}

/** Base para recursos de solo lectura: el servidor no ofrece alta, cambio ni baja. */
export abstract class ReadOnlyRepository<T extends Entity> implements Repository<T> {
  abstract list(): Promise<T[]>;

  async create(): Promise<T> {
    throw new Error('Este recurso es de solo lectura');
  }

  async update(): Promise<T> {
    throw new Error('Este recurso es de solo lectura');
  }

  async remove(): Promise<void> {
    throw new Error('Este recurso es de solo lectura');
  }
}
