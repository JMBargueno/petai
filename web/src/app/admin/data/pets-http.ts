import type { AdminApi } from '../api';
import type { PetEntry } from './models';
import type { Repository } from './repository-base';

interface ApiPetOwner {
  id: string;
  email: string;
  displayName: string | null;
}

interface ApiPet {
  id: string;
  nickname: string;
  speciesId: string;
  rarity: string;
  level: number;
  stage: string;
  shiny: boolean;
  sick: boolean;
  createdAt: string;
  owner: ApiPetOwner;
}

interface Page {
  items: ApiPet[];
  total: number;
}

const PAGE_SIZE = 100;

const toPetEntry = (p: ApiPet): PetEntry => ({
  id: p.id,
  nickname: p.nickname,
  speciesId: p.speciesId,
  owner: p.owner.displayName ?? p.owner.email,
  rarity: p.rarity,
  level: p.level,
  stage: p.stage,
  shiny: p.shiny,
  sick: p.sick,
  createdAt: p.createdAt,
});

/**
 * Mascotas reales del backend (`/v1/admin/pets`). El usuario final no renombra a sus pockais:
 * desde el panel solo se cambia el apodo (el servidor lo audita como `pet_rename`). No se crean
 * ni se borran mascotas aquí, y el resto de campos son de solo lectura.
 */
export class HttpPetsRepository implements Repository<PetEntry> {
  private readonly known = new Map<string, PetEntry>();

  constructor(private readonly api: Pick<AdminApi, 'request'>) {}

  async list(): Promise<PetEntry[]> {
    const rows: PetEntry[] = [];
    for (let page = 1; ; page++) {
      const res = await this.api.request<Page>(`/v1/admin/pets?page=${page}&pageSize=${PAGE_SIZE}`);
      rows.push(...res.items.map(toPetEntry));
      if (res.items.length < PAGE_SIZE || rows.length >= res.total) break;
    }
    this.known.clear();
    for (const row of rows) this.known.set(row.id, row);
    return rows;
  }

  async update(id: string, patch: Partial<PetEntry>): Promise<PetEntry> {
    const current = this.known.get(id);
    if (!current) throw new Error(`No existe el registro "${id}"`);
    const nickname = patch.nickname?.trim();
    if (!nickname || nickname === current.nickname) return current;

    const updated = toPetEntry(
      await this.api.request<ApiPet>(`/v1/admin/pets/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ nickname }),
      }),
    );
    this.known.set(id, updated);
    return updated;
  }

  async create(): Promise<PetEntry> {
    throw new Error('Las mascotas se eclosionan en la app, no desde el panel');
  }

  async remove(): Promise<void> {
    throw new Error('Las mascotas no se borran desde el panel');
  }
}
