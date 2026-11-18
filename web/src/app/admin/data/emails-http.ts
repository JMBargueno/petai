import { InjectionToken, inject } from '@angular/core';
import { AdminApi } from '../api';
import type { AdminRole } from './models';

export type CampaignStatus = 'queued' | 'sending' | 'sent' | 'failed';

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  queued: 'En cola',
  sending: 'Enviando',
  sent: 'Enviado',
  failed: 'Fallido',
};

/** Destinatarios de un envío (mismo contrato que el backend). */
export type Audience =
  | { type: 'users'; userIds: string[] }
  | { type: 'emails'; emails: string[] }
  | { type: 'segment'; role?: AdminRole; verified: 'any' | 'verified' | 'unverified' };

export interface EmailContent {
  subject: string;
  preheader?: string;
  html: string;
}

export interface Campaign {
  id: string;
  subject: string;
  audience: Audience;
  status: CampaignStatus;
  total: number;
  sent: number;
  failed: number;
  lastError: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdBy: { id: string; email: string; displayName: string | null } | null;
}

/** Usuario encontrado por la búsqueda del selector de destinatarios. */
export interface UserHit {
  id: string;
  email: string;
  displayName: string | null;
}

interface Page<T> {
  items: T[];
  total: number;
}

/** Separa una lista pegada (comas, punto y coma, espacios o saltos de línea) en correos únicos. */
export function parseEmailList(text: string): { valid: string[]; invalid: string[] } {
  const parts = text
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const p of new Set(parts)) (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p) ? valid : invalid).push(p);
  return { valid, invalid };
}

/** Envíos de correo del panel (`/v1/admin/emails`). */
export class EmailsHttp {
  constructor(private readonly api: Pick<AdminApi, 'request'>) {}

  async preview(content: EmailContent): Promise<string> {
    const res = await this.api.request<{ html: string }>('/v1/admin/emails/preview', {
      method: 'POST',
      body: JSON.stringify(content),
    });
    return res.html;
  }

  async count(audience: Audience): Promise<number> {
    const res = await this.api.request<{ count: number }>('/v1/admin/emails/audience/count', {
      method: 'POST',
      body: JSON.stringify({ audience }),
    });
    return res.count;
  }

  async sendTest(content: EmailContent): Promise<string> {
    const res = await this.api.request<{ to: string }>('/v1/admin/emails/test', { method: 'POST', body: JSON.stringify(content) });
    return res.to;
  }

  send(content: EmailContent, audience: Audience): Promise<Campaign> {
    return this.api.request<Campaign>('/v1/admin/emails', { method: 'POST', body: JSON.stringify({ ...content, audience }) });
  }

  async list(): Promise<Campaign[]> {
    return (await this.api.request<Page<Campaign>>('/v1/admin/emails?page=1&pageSize=50')).items;
  }

  async searchUsers(q: string): Promise<UserHit[]> {
    const res = await this.api.request<Page<UserHit>>(`/v1/admin/users?page=1&pageSize=10&q=${encodeURIComponent(q)}`);
    return res.items.map(({ id, email, displayName }) => ({ id, email, displayName }));
  }
}

export const EMAILS = new InjectionToken<EmailsHttp>('EMAILS', {
  providedIn: 'root',
  factory: () => new EmailsHttp(inject(AdminApi)),
});
