import type { AdminApi } from '../api';
import type { AdminRole, AdminUser } from './models';
import type { Repository } from './repository-base';

interface ApiUser {
  id: string;
  email: string;
  displayName: string | null;
  handle?: string | null;
  role: AdminRole;
  coins: number;
  gems: number;
  accountXp: number;
  emailVerifiedAt: string | null;
  createdAt: string;
}

interface Page {
  items: ApiUser[];
  total: number;
}

const PAGE_SIZE = 100;

const toAdminUser = ({ emailVerifiedAt, ...u }: ApiUser): AdminUser => ({
  ...u,
  displayName: u.displayName ?? '',
  // Sin nickname todavía: cadena vacía (la cuenta lo elegirá al entrar).
  handle: u.handle ? `@${u.handle}` : '',
  emailVerified: emailVerifiedAt != null,
});

/**
 * Usuarios reales del backend (`/v1/admin/users`). Desde el panel se cambia el rol y se fija el saldo
 * (monedas y gemas, valor absoluto): las cuentas no se crean ni se borran aquí.
 */
export class HttpUsersRepository implements Repository<AdminUser> {
  private readonly known = new Map<string, AdminUser>();

  constructor(private readonly api: Pick<AdminApi, 'request'>) {}

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
    let result = current;
    const base = `/v1/admin/users/${encodeURIComponent(id)}`;

    if (patch.role && patch.role !== current.role) {
      result = toAdminUser(
        await this.api.request<ApiUser>(`${base}/role`, { method: 'PATCH', body: JSON.stringify({ role: patch.role }) }),
      );
      this.known.set(id, result);
    }

    // Verificación manual (soporte). Desde el panel no se puede quitar la verificación.
    if (patch.emailVerified !== undefined && patch.emailVerified !== current.emailVerified) {
      if (!patch.emailVerified) throw new Error('Un correo verificado no se puede marcar como no verificado');
      await this.api.request(`${base}/verify-email`, { method: 'POST' });
      result = { ...result, emailVerified: true };
      this.known.set(id, result);
    }

    const balance: { coins?: number; gems?: number } = {};
    if (patch.coins !== undefined && patch.coins !== current.coins) balance.coins = patch.coins;
    if (patch.gems !== undefined && patch.gems !== current.gems) balance.gems = patch.gems;
    if (balance.coins !== undefined || balance.gems !== undefined) {
      result = toAdminUser(
        await this.api.request<ApiUser>(`${base}/balance`, { method: 'PATCH', body: JSON.stringify(balance) }),
      );
      this.known.set(id, result);
    }
    return result;
  }

  async create(): Promise<AdminUser> {
    throw new Error('Las cuentas se crean desde la app, no desde el panel');
  }

  async remove(): Promise<void> {
    throw new Error('Las cuentas no se borran desde el panel');
  }
}
