import { InjectionToken, inject } from '@angular/core';
import { AdminApi } from '../api';
import { AuditLog } from './audit-log';

export type InviteStatus = 'active' | 'used' | 'revoked' | 'expired';

export const INVITE_STATUS_LABELS: Record<InviteStatus, string> = {
  active: 'Activo',
  used: 'Agotado',
  revoked: 'Revocado',
  expired: 'Caducado',
};

export interface Invite {
  id: string;
  code: string;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  revokedAt: string | null;
  note: string | null;
  createdAt: string;
  createdBy: { id: string; email: string; displayName: string | null } | null;
  status: InviteStatus;
}

export interface NewInvites {
  count: number;
  maxUses: number;
  /** ISO 8601 o null para que no caduque. */
  expiresAt: string | null;
  note: string;
}

interface Page {
  items: Invite[];
  total: number;
}

const PAGE_SIZE = 100;

/**
 * Invitaciones de registro reales del backend (`/v1/admin/invites` y
 * `/v1/admin/registration-settings`). Los códigos no se borran: se revocan.
 */
export class InvitesHttp {
  constructor(
    private readonly api: Pick<AdminApi, 'request'>,
    private readonly audit?: Pick<AuditLog, 'record'>,
  ) {}

  async list(): Promise<Invite[]> {
    const rows: Invite[] = [];
    for (let page = 1; ; page++) {
      const res = await this.api.request<Page>(`/v1/admin/invites?page=${page}&pageSize=${PAGE_SIZE}`);
      rows.push(...res.items);
      if (res.items.length < PAGE_SIZE || rows.length >= res.total) break;
    }
    return rows;
  }

  async create(input: NewInvites): Promise<Invite[]> {
    const body = {
      count: input.count,
      maxUses: input.maxUses,
      expiresAt: input.expiresAt,
      ...(input.note.trim() ? { note: input.note.trim() } : {}),
    };
    const res = await this.api.request<{ items: Invite[] }>('/v1/admin/invites', { method: 'POST', body: JSON.stringify(body) });
    this.audit?.record('Alta', 'invitaciones', `${res.items.length} código(s) · ${input.maxUses} uso(s) cada uno`);
    return res.items;
  }

  async revoke(id: string): Promise<Invite> {
    const invite = await this.api.request<Invite>(`/v1/admin/invites/${encodeURIComponent(id)}/revoke`, { method: 'POST' });
    this.audit?.record('Baja', 'invitaciones', `${invite.code} revocado`);
    return invite;
  }

  async inviteOnly(): Promise<boolean> {
    return (await this.api.request<{ inviteOnly: boolean }>('/v1/admin/registration-settings')).inviteOnly;
  }

  async setInviteOnly(inviteOnly: boolean): Promise<boolean> {
    const res = await this.api.request<{ inviteOnly: boolean }>('/v1/admin/registration-settings', {
      method: 'PATCH',
      body: JSON.stringify({ inviteOnly }),
    });
    this.audit?.record('Cambio', 'invitaciones', `Registro solo con invitación: ${res.inviteOnly ? 'activado' : 'desactivado'}`);
    return res.inviteOnly;
  }
}

export const INVITES = new InjectionToken<InvitesHttp>('INVITES', {
  providedIn: 'root',
  factory: () => new InvitesHttp(inject(AdminApi), inject(AuditLog)),
});
