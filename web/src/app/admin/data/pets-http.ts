import type { AdminApi } from '../api';
import type { AuditLog } from './audit-log';
import type { PetEntry } from './models';
import type { Repository } from './repository';

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

/** Etapas válidas del backend (`balance.leveling.stages`): mismo alfabeto que `STAGES`. */
const STAGE_KEYS: readonly PetEntry['stage'][] = ['baby', 'juvenile', 'adult', 'final'];
const toStage = (stage: string): PetEntry['stage'] =>
  (STAGE_KEYS as readonly string[]).includes(stage) ? (stage as PetEntry['stage']) : 'baby';

const toPetEntry = (p: ApiPet): PetEntry => ({
  id: p.id,
  nickname: p.nickname,
  speciesId: p.speciesId,
  owner: p.owner.displayName ?? p.owner.email,
  rarity: p.rarity,
  level: p.level,
  stage: toStage(p.stage),
  shiny: p.shiny,
  sick: p.sick,
});

/**
 * Mascotas reales del backend (`/v1/admin/pets`). El usuario final no renombra a sus pockais:
 * desde el panel solo se cambia el apodo. No se crean ni se borran mascotas aquí, y el resto
 * de campos (nivel, etapa, rareza…) son de solo lectura.
 */
export class HttpPetsRepository implements Repository<PetEntry> {
  private readonly known = new Map<string, PetEntry>();

  constructor(
    private readonly api: Pick<AdminApi, 'request'>,
    private readonly audit?: Pick<AuditLog, 'record'>,
  ) {}

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
    this.audit?.record('Cambio', 'pockais', `${updated.owner} · apodo: «${current.nickname}» → «${updated.nickname}»`);
    return updated;
  }

  async create(): Promise<PetEntry> {
    throw new Error('Las mascotas se eclosionan en la app, no desde el panel');
  }

  async remove(): Promise<void> {
    throw new Error('Las mascotas no se borran desde el panel');
  }

  /** Datos reales: no hay nada que restablecer. */
  async reset(): Promise<void> {}
}