import { InjectionToken, inject } from '@angular/core';
import { AdminApi } from '../api';

export type VoucherStatus = 'active' | 'used' | 'revoked' | 'expired';

export const VOUCHER_STATUS_LABELS: Record<VoucherStatus, string> = {
  active: 'Activo',
  used: 'Agotado',
  revoked: 'Revocado',
  expired: 'Caducado',
};

export const CHEST_TYPES = ['bronze', 'silver', 'gold', 'diamond', 'mythic'] as const;
export type ChestType = (typeof CHEST_TYPES)[number];

export const CHEST_LABELS: Record<ChestType, string> = {
  bronze: 'Bronce',
  silver: 'Plata',
  gold: 'Oro',
  diamond: 'Diamante',
  mythic: 'Mítico',
};

/** Paquete de recompensas (lo mismo para un voucher que para un regalo directo). */
export interface Rewards {
  coins: number;
  gems: number;
  proDays: number;
  chests: { type: ChestType; qty: number }[];
  accessories: string[];
}

export interface AccessoryOption {
  id: string;
  name: string;
  slot: string;
  rarity: string;
}

export interface Voucher {
  id: string;
  code: string;
  rewards: Partial<Rewards>;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  revokedAt: string | null;
  note: string | null;
  createdAt: string;
  createdBy: { id: string; email: string; displayName: string | null } | null;
  status: VoucherStatus;
}

export interface NewVouchers {
  /** Código personalizado; vacío = `count` códigos aleatorios. */
  code: string;
  count: number;
  maxUses: number;
  expiresAt: string | null;
  note: string;
  rewards: Rewards;
}

export interface GrantResult {
  redemptionId: string;
  granted: {
    coins: number;
    gems: number;
    proDays: number;
    proUntil: string | null;
    chests: { type: ChestType; qty: number }[];
    accessories: { id: string; name: string; alreadyOwned: boolean }[];
  };
}

interface Page {
  items: Voucher[];
  total: number;
}

const PAGE_SIZE = 100;

export const emptyRewards = (): Rewards => ({ coins: 0, gems: 0, proDays: 0, chests: [], accessories: [] });

/** Solo lo que lleva algo: el servidor rechaza un paquete vacío. */
export function compactRewards(r: Rewards): Partial<Rewards> {
  const out: Partial<Rewards> = {};
  if (r.coins > 0) out.coins = r.coins;
  if (r.gems > 0) out.gems = r.gems;
  if (r.proDays > 0) out.proDays = r.proDays;
  const chests = r.chests.filter((c) => c.qty > 0);
  if (chests.length) out.chests = chests;
  if (r.accessories.length) out.accessories = [...r.accessories];
  return out;
}

export const hasRewards = (r: Rewards) => Object.keys(compactRewards(r)).length > 0;

/** Resumen corto de un paquete para tablas y avisos: «500 monedas · 7 días Pro · 2 cofres de Oro». */
export function describeRewards(r: Partial<Rewards>, accessoryName: (id: string) => string = (id) => id): string {
  const parts: string[] = [];
  if (r.coins) parts.push(`${r.coins.toLocaleString('es')} monedas`);
  if (r.gems) parts.push(`${r.gems.toLocaleString('es')} gemas`);
  if (r.proDays) parts.push(`${r.proDays} ${r.proDays === 1 ? 'día' : 'días'} Pro`);
  for (const c of r.chests ?? []) parts.push(`${c.qty} ${c.qty === 1 ? 'cofre' : 'cofres'} de ${CHEST_LABELS[c.type] ?? c.type}`);
  for (const a of r.accessories ?? []) parts.push(accessoryName(a));
  return parts.join(' · ') || '—';
}

/**
 * Vouchers de recompensas (`/v1/admin/vouchers`) y regalos directos (`/v1/admin/users/:id/grant`).
 * Los vouchers no se borran: se revocan.
 */
export class VouchersHttp {
  constructor(private readonly api: Pick<AdminApi, 'request'>) {}

  async list(): Promise<Voucher[]> {
    const rows: Voucher[] = [];
    for (let page = 1; ; page++) {
      const res = await this.api.request<Page>(`/v1/admin/vouchers?page=${page}&pageSize=${PAGE_SIZE}`);
      rows.push(...res.items);
      if (res.items.length < PAGE_SIZE || rows.length >= res.total) break;
    }
    return rows;
  }

  accessories(): Promise<AccessoryOption[]> {
    return this.api.request<AccessoryOption[]>('/v1/admin/vouchers/accessories');
  }

  async create(input: NewVouchers): Promise<Voucher[]> {
    const code = input.code.trim();
    const body = {
      ...(code ? { code } : { count: input.count }),
      maxUses: input.maxUses,
      expiresAt: input.expiresAt,
      ...(input.note.trim() ? { note: input.note.trim() } : {}),
      rewards: compactRewards(input.rewards),
    };
    const res = await this.api.request<{ items: Voucher[] }>('/v1/admin/vouchers', { method: 'POST', body: JSON.stringify(body) });
    return res.items;
  }

  revoke(id: string): Promise<Voucher> {
    return this.api.request<Voucher>(`/v1/admin/vouchers/${encodeURIComponent(id)}/revoke`, { method: 'POST' });
  }

  grant(userId: string, rewards: Rewards, note: string): Promise<GrantResult> {
    const body = { rewards: compactRewards(rewards), ...(note.trim() ? { note: note.trim() } : {}) };
    return this.api.request<GrantResult>(`/v1/admin/users/${encodeURIComponent(userId)}/grant`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
}

export const VOUCHERS = new InjectionToken<VouchersHttp>('VOUCHERS', {
  providedIn: 'root',
  factory: () => new VouchersHttp(inject(AdminApi)),
});
