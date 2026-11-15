import type { AdminApi } from '../api';
import type { AuditLog } from './audit-log';
import type { AdminRole, AdminUser } from './models';
import type { Repository } from './repository';

interface ApiUser {
  id: string;
  email: string;
  displayName: string | null;
  role: AdminRole;
  coins: number;
  gems: number;
  accountXp: number;
  createdAt: string;
}

interface Page {
  items: ApiUser[];
  total: number;
}

const PAGE_SIZE = 100;

const toAdminUser = (u: ApiUser): AdminUser => ({ ...u, displayName: u.displayName ?? '' });

/**
 * Usuarios reales del backend (`/v1/admin/users`). Desde el panel solo se cambia el rol:
 * las cuentas no se crean ni se borran aquí, y el saldo no se edita a mano.
 */
export class HttpUsersRepository implements Repository<AdminUser> {
  private readonly known = new Map<string, AdminUser>();

  constructor(
    private readonly api: Pick<AdminApi, 'request'>,
    private readonly audit?: Pick<AuditLog, 'record'>,
  ) {}

  async list(): Promise<AdminUser[]> {
    const rows: AdminUser[] = [];
    for (let page = 1; ; page++) {
      const res = await this.api.request<Page>(`/v1/admin/users?page=${page}&pageSize=${PAGE_SIZE}`);
      rows.push(...res.items.map(toAdminUser));
      if (res.items.length < PAGE_SIZE || rows.length >= res.total) break;
    }
    this.known.clear();
    for (const row of rows) this.known.set(row.id, row);
    return rows;
  }

  async update(id: string, patch: Partial<AdminUser>): Promise<AdminUser> {
    const current = this.known.get(id);
    if (!current) throw new Error(`No existe el registro "${id}"`);
    if (!patch.role || patch.role === current.role) return current;

    const updated = toAdminUser(
      await this.api.request<ApiUser>(`/v1/admin/users/${encodeURIComponent(id)}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: patch.role }),
      }),
    );
    this.known.set(id, updated);
    this.audit?.record('Cambio', 'usuarios', `${updated.email} (rol: ${current.role} → ${updated.role})`);
    return updated;
  }

  async create(): Promise<AdminUser> {
    throw new Error('Las cuentas se crean desde la app, no desde el panel');
  }

  async remove(): Promise<void> {
    throw new Error('Las cuentas no se borran desde el panel');
  }

  /** Datos reales: no hay nada que restablecer. */
  async reset(): Promise<void> {}
}
