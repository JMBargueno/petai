import { InjectionToken, inject } from '@angular/core';
import { AdminApi } from '../api';
import type { AdminStats, AuditEntry } from './models';

export interface AuditPage {
  items: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
}

/** Métricas del resumen y registro de auditoría del servidor (`/v1/admin/stats`, `/v1/admin/audit`). */
export class ReportsHttp {
  constructor(private readonly api: Pick<AdminApi, 'request'>) {}

  stats(): Promise<AdminStats> {
    return this.api.request<AdminStats>('/v1/admin/stats');
  }

  audit(page = 1, pageSize = 50, event = ''): Promise<AuditPage> {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (event) params.set('event', event);
    return this.api.request<AuditPage>(`/v1/admin/audit?${params}`);
  }
}

export const REPORTS = new InjectionToken<ReportsHttp>('REPORTS', {
  providedIn: 'root',
  factory: () => new ReportsHttp(inject(AdminApi)),
});
