import type { AdminApi } from '../api';
import type { CatalogItem, GameEvent, PetEntry, SpeciesEntry } from './models';
import { ReadOnlyRepository, type Repository } from './repository-base';

type Api = Pick<AdminApi, 'request'>;
type Currency = 'priceCoins' | 'priceGems';

/**
 * Precios de la tienda (`/v1/admin/items`). Solo se cambian los precios: los objetos los define
 * `foods.json` y se cargan con el seed.
 */
export class HttpItemsRepository implements Repository<CatalogItem> {
  constructor(private readonly api: Api) {}

  list(): Promise<CatalogItem[]> {
    return this.api.request<CatalogItem[]>('/v1/admin/items');
  }

  async update(id: string, patch: Partial<CatalogItem>): Promise<CatalogItem> {
    const body: Partial<Record<Currency, number>> = {};
    if (patch.priceCoins !== undefined) body.priceCoins = patch.priceCoins;
    if (patch.priceGems !== undefined) body.priceGems = patch.priceGems;
    if (!Object.keys(body).length) throw new Error('Solo se pueden cambiar los precios');
    return this.api.request<CatalogItem>(`/v1/admin/items/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  /** Ajusta un porcentaje la moneda indicada en varios objetos, en una sola transacción del servidor. */
  bulkAdjust(ids: string[], percent: number, currency: Currency) {
    return this.api.request<{ items: CatalogItem[]; changed: number }>('/v1/admin/items/prices', {
      method: 'PATCH',
      body: JSON.stringify({ ids, percent, currency }),
    });
  }

  async create(): Promise<CatalogItem> {
    throw new Error('Los objetos se añaden en foods.json, no desde el panel');
  }

  async remove(): Promise<void> {
    throw new Error('Los objetos no se borran desde el panel');
  }
}

/** Especies que usa el juego (game-data). */
export class HttpSpeciesRepository extends ReadOnlyRepository<SpeciesEntry> {
  constructor(private readonly api: Api) {
    super();
  }

  list(): Promise<SpeciesEntry[]> {
    return this.api.request<SpeciesEntry[]>('/v1/admin/species');
  }
}

/** Festividades, temporadas, torneos y raids, de donde los lee el juego. */
export class HttpEventsRepository extends ReadOnlyRepository<GameEvent> {
  constructor(private readonly api: Api) {
    super();
  }

  list(): Promise<GameEvent[]> {
    return this.api.request<GameEvent[]>('/v1/admin/events');
  }
}

const PETS_PAGE_SIZE = 100;
/** Tope de mascotas que carga la tabla (las más recientes); la búsqueda fina se hace en servidor. */
export const MAX_PETS = 1000;

/** Mascotas de los jugadores (`/v1/admin/pets`), las más recientes primero. */
export class HttpPetsRepository extends ReadOnlyRepository<PetEntry> {
  constructor(private readonly api: Api) {
    super();
  }

  async list(): Promise<PetEntry[]> {
    const rows: PetEntry[] = [];
    for (let page = 1; rows.length < MAX_PETS; page++) {
      const res = await this.api.request<{ items: PetEntry[]; total: number }>(
        `/v1/admin/pets?page=${page}&pageSize=${PETS_PAGE_SIZE}`,
      );
      rows.push(...res.items);
      if (res.items.length < PETS_PAGE_SIZE || rows.length >= res.total) break;
    }
    return rows.slice(0, MAX_PETS);
  }
}
