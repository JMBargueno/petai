import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { parseOrBadRequest } from '../auth/dto/auth.schemas';
import { hasPermission } from '../authz/permissions';
import { EntitlementService } from '../billing/entitlement.service';
import { GameDataService } from '../game-data/game-data.service';
import { InventoryService } from '../inventory/inventory.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WalletService } from '../wallet/wallet.service';
import { grantSchema, Rewards, RewardChestType } from './rewards.schemas';

type Tx = Prisma.TransactionClient;
export type RewardSource = 'voucher' | 'admin_grant';
export type Actor = { id: string; role?: string };

/** Lo que se ha concedido de verdad (lo que enseñan los clientes en el aviso y la animación). */
export interface GrantedRewards {
  coins: number;
  gems: number;
  proDays: number;
  /** Fin del Pro concedido por vouchers/regalos tras sumar los días (ISO), o null si no había días. */
  proUntil: string | null;
  chests: { type: RewardChestType; qty: number }[];
  /** `alreadyOwned`: el usuario ya tenía la prenda y no se le ha dado otra. */
  accessories: { id: string; name: string; alreadyOwned: boolean }[];
}

/** Payload del evento WebSocket `reward:received` y respuesta del canje. */
export interface RewardReceivedEvent {
  source: RewardSource;
  /** Id único de esta entrega (canje o regalo): los clientes lo usan para no celebrar dos veces. */
  redemptionId: string;
  code?: string;
  note?: string;
  granted: GrantedRewards;
}

export interface AppliedRewards {
  granted: GrantedRewards;
  chests: { id: string; type: RewardChestType }[];
}

/** `Subscription.source` de los días Pro concedidos por vouchers y regalos (una fila por usuario). */
export const VOUCHER_SUBSCRIPTION_SOURCE = 'voucher';

/**
 * Entrega de paquetes de recompensas (vouchers y regalos directos del panel). Todo se escribe en la
 * transacción del llamante (`apply`) y los avisos en tiempo real se emiten después del commit
 * (`announce`), para no anunciar algo que luego se deshace.
 */
@Injectable()
export class RewardsService {
  private readonly logger = new Logger(RewardsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly inventory: InventoryService,
    private readonly gameData: GameDataService,
    private readonly entitlement: EntitlementService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Comprueba que las prendas existen en el catálogo (al crear el voucher o el regalo). */
  assertAccessories(ids: string[]): void {
    if (ids.length === 0) return;
    const known = new Set((this.gameData.getAccessories() ?? []).map((a: any) => a.id));
    const unknown = ids.filter((id) => !known.has(id));
    if (unknown.length) throw new BadRequestException(`Prenda desconocida: ${unknown.join(', ')}`);
  }

  /** Los días Pro cuestan dinero real: solo quien gestiona la facturación puede regalarlos. */
  assertCanGrant(actor: Actor, rewards: Rewards): void {
    if (rewards.proDays > 0 && !hasPermission(actor.role, 'billing:manage')) {
      throw new ForbiddenException('Regalar días de Pro requiere el permiso billing:manage');
    }
  }

  /** Acredita el paquete dentro de `tx`. No emite nada: llama a `announce` tras el commit. */
  async apply(tx: Tx, userId: string, rewards: Rewards, source: RewardSource): Promise<AppliedRewards> {
    if (rewards.coins > 0) await this.wallet.credit(tx, userId, 'coins', rewards.coins);
    if (rewards.gems > 0) await this.wallet.credit(tx, userId, 'gems', rewards.gems);

    let proUntil: string | null = null;
    if (rewards.proDays > 0) proUntil = (await this.extendPro(tx, userId, rewards.proDays)).toISOString();

    const chests: AppliedRewards['chests'] = [];
    for (const { type, qty } of rewards.chests) {
      for (let i = 0; i < qty; i++) {
        const chest = await tx.chest.create({ data: { userId, type, source }, select: { id: true } });
        chests.push({ id: chest.id, type });
      }
    }

    const accessories: GrantedRewards['accessories'] = [];
    if (rewards.accessories.length) {
      const catalog = new Map((this.gameData.getAccessories() ?? []).map((a: any) => [a.id, a]));
      const owned = await tx.inventoryItem.findMany({
        where: { userId, itemId: { in: rewards.accessories }, qty: { gt: 0 } },
        select: { itemId: true },
      });
      const ownedIds = new Set(owned.map((o) => o.itemId));
      for (const id of rewards.accessories) {
        const alreadyOwned = ownedIds.has(id);
        if (!alreadyOwned) await this.inventory.grantExclusiveItem(userId, id, tx);
        accessories.push({ id, name: catalog.get(id)?.name ?? id, alreadyOwned });
      }
    }

    return {
      granted: { coins: rewards.coins, gems: rewards.gems, proDays: rewards.proDays, proUntil, chests: rewards.chests, accessories },
      chests,
    };
  }

  /**
   * Suma días a la fila Pro de vouchers del usuario (la crea si no existe). El nuevo fin es
   * `GREATEST(fin actual, ahora) + días`, calculado en una sola sentencia: dos canjes simultáneos no
   * pierden días.
   */
  private async extendPro(tx: Tx, userId: string, days: number): Promise<Date> {
    const rows = await tx.$queryRaw<{ currentPeriodEnd: Date }[]>`
      INSERT INTO "Subscription" ("id", "userId", "source", "externalId", "productId", "plan", "status", "currentPeriodEnd", "cancelAtPeriodEnd", "createdAt", "updatedAt")
      VALUES (${crypto.randomUUID()}, ${userId}, ${VOUCHER_SUBSCRIPTION_SOURCE}, ${userId}, 'voucher', 'pro', 'active', NOW() + make_interval(days => ${days}::int), false, NOW(), NOW())
      ON CONFLICT ("source", "externalId") DO UPDATE SET
        "currentPeriodEnd" = GREATEST("Subscription"."currentPeriodEnd", NOW()) + make_interval(days => ${days}::int),
        "status" = 'active',
        "cancelAtPeriodEnd" = false,
        "updatedAt" = NOW()
      RETURNING "currentPeriodEnd"`;
    return new Date(rows[0].currentPeriodEnd);
  }

  /** Avisos tras el commit: cofres, plan, la celebración y la reacción de la mascota. */
  async announce(userId: string, event: RewardReceivedEvent, chests: AppliedRewards['chests']): Promise<void> {
    for (const c of chests) {
      this.realtime.emitToUser(userId, 'chest:unlocked', { chestId: c.id, type: c.type, source: event.source });
    }
    if (event.granted.proDays > 0) {
      await this.entitlement.invalidate(userId);
      this.realtime.emitToUser(userId, 'entitlement:updated', { plan: 'pro' });
    }
    this.realtime.emitToUser(userId, 'reward:received', event);
    this.realtime.emitPetAction(userId, null, 'gift_received', { source: event.source });
  }

  /** Regalo directo desde el panel (Usuarios › Dar recompensa). Queda auditado. */
  async grantToUser(actor: Actor, userId: string, raw: unknown): Promise<RewardReceivedEvent> {
    const { rewards, note } = parseOrBadRequest(grantSchema, raw);
    this.assertCanGrant(actor, rewards);
    this.assertAccessories(rewards.accessories);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const redemptionId = crypto.randomUUID();
    const applied = await this.prisma.$transaction(async (tx) => {
      const result = await this.apply(tx, userId, rewards, 'admin_grant');
      await tx.auditLog.create({
        data: { userId: actor.id, event: 'user_grant', metadata: { targetUserId: userId, grantId: redemptionId, rewards, note: note || null } as any },
      });
      return result;
    });
    const event: RewardReceivedEvent = { source: 'admin_grant', redemptionId, ...(note ? { note } : {}), granted: applied.granted };
    await this.announce(userId, event, applied.chests);
    this.logger.log(`Regalo ${redemptionId} de ${actor.id} a ${userId}`);
    return event;
  }
}
