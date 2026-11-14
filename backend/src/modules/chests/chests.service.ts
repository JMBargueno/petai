import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { GameDataService } from '../game-data/game-data.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  DropEngineService,
  PityState,
  DropTier,
  QtyRangeResolver,
  tierRank,
} from './drop-engine.service';
import { ChestPityService } from './chest-pity.service';
import { ChestsProcessor } from './chests.processor';
import { WalletService } from '../wallet/wallet.service';
import {
  ChestListResponse,
  ChestResponse,
  OpenChestResponse,
  DropItem,
  PurchaseChestResponse,
} from './dto/chest.dto';
import { ChestHistoryResponse } from './dto/chest-history.dto';

const PURCHASABLE_TYPES = ['bronze', 'silver', 'gold'] as const;
const MAX_QTY_PER_DROP = 99;
const HISTORY_PAGE_MAX = 100;
const HISTORY_PAGE_DEFAULT = 50;

/**
 * Orquestación del módulo de cofres: listado, apertura (transacción atómica + drops autoritativos +
 * pity), compra (saldo + límite diario) e historial. La aleatoriedad vive en `DropEngineService`
 * (crypto.randomInt) y los datos en `balance.json → chests` (data-driven).
 */
@Injectable()
export class ChestsService {
  private readonly logger = new Logger(ChestsService.name);
  private itemNameMap: Map<string, string> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
    private readonly realtime: RealtimeGateway,
    private readonly dropEngine: DropEngineService,
    private readonly chestPityService: ChestPityService,
    private readonly processor: ChestsProcessor,
    private readonly wallet: WalletService,
  ) {}

  /** Sección `chests` de balance.json (tablas de drop, precios, pity, límites). */
  private chestsConfig(): any {
    const balance = this.gameData.getBalance() ?? {};
    return balance.chests ?? {};
  }

  /** Nombre de display de un item desde el catálogo (foods.json), con respaldo al id. */
  private itemName(itemId: string): string {
    if (!this.itemNameMap) {
      const foods: any[] = this.gameData.getFoods() ?? [];
      this.itemNameMap = new Map<string, string>(
        foods.map((f) => [f.id, f.name] as [string, string]),
      );
    }
    return this.itemNameMap.get(itemId) ?? itemId;
  }

  private isUUID(value: unknown): boolean {
    return (
      typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    );
  }

  // ---------- US1: listado de cofres no abiertos ----------

  async listChests(userId: string): Promise<ChestListResponse> {
    const rows = await this.prisma.chest.findMany({
      where: { userId, openedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, type: true, source: true, createdAt: true },
    });
    const chests: ChestResponse[] = rows.map((c) => ({
      id: c.id,
      type: c.type,
      source: c.source,
      createdAt: c.createdAt,
    }));
    return { chests };
  }

  // ---------- Integración cross-módulo: otorgar cofres (T029) ----------

  /**
   * Otorga un cofre de forma asincrónica (fire-and-forget) sin bloquear la acción que lo dispara.
   * Encola el equivalente a un job `chests:create` vía el procesador (`setImmediate`): crea el cofre
   * en BD y emite `chest:unlocked`. Expuesto para otros módulos (missions, battles, pets/evolve,
   * events) y para la compra directa.
   *
   * @param userId Usuario que recibe el cofre.
   * @param type   `bronze | silver | gold | diamond | mythic`.
   * @param source `daily_mission | battle | evolution | purchase | event`.
   */
  async grantChest(userId: string, type: string, source: string): Promise<void> {
    setImmediate(() => {
      this.processor
        .processCreate({ userId, type, source })
        .catch((err) =>
          this.logger.error(`grantChest falló (userId=${userId}, type=${type}, source=${source}): ${err?.message}`),
        );
    });
  }

  // ---------- US2 (+US4): apertura atómica con drops autoritativos y pity ----------

  /**
   * Abre un cofre de forma idempotente (FR-003/FR-004/FR-005/FR-006). Dentro de una única
   * transacción Prisma: (1) reclamo atómico `openedAt` (anti race-condition, SC-004), (2) resolución
   * de drops con `crypto.randomInt` sobre la tabla data-driven, (3) acreditación en `InventoryItem`
   * (cap 99; excedente → monedas, FR-015), (4) persistencia de `Chest.drops` y (5) update de pity
   * (FR-007). Todo es atómico: si alguna etapa falla, no se escribe nada.
   */
  async openChest(userId: string, chestId: string): Promise<OpenChestResponse> {
    if (!this.isUUID(chestId)) {
      throw new NotFoundException('Cofre no encontrado');
    }

    const existing = await this.prisma.chest.findFirst({
      where: { id: chestId, userId },
      select: { id: true, type: true, source: true, createdAt: true, openedAt: true },
    });
    if (!existing) throw new NotFoundException('Cofre no encontrado');
    if (existing.openedAt) throw new ConflictException('Cofre ya abierto');

    const chestCfg = this.chestsConfig()[existing.type];
    if (!chestCfg?.dropTable?.length) {
      throw new BadRequestException('El tipo de cofre no tiene tabla de drops configurada');
    }

    const qtyRange: QtyRangeResolver = (e) => [e.qtyMin, e.qtyMax];
    const threshold = typeof chestCfg.pity?.threshold === 'number' ? chestCfg.pity.threshold : 10;
    const minTier = (chestCfg.pity?.minTier ?? 'rare') as DropTier;
    const pityRow = await this.chestPityService.getPity(userId, existing.type);
    const pityState: PityState = { count: pityRow.count, threshold, minTier };

    const dropsPerChest = typeof chestCfg.dropsPerChest === 'number' ? chestCfg.dropsPerChest : 2;
    const hadItems = new Set(
      (
        await this.prisma.inventoryItem.findMany({
          where: { userId },
          select: { itemId: true },
        })
      ).map((i) => i.itemId),
    );

    const now = new Date();
    const drops = await this.prisma.$transaction(async (tx) => {
      // 1) Reclamo atómico: solo una petición puede abrir (la otra recibe 409/404).
      const claimed = await tx.chest.updateMany({
        where: { id: chestId, userId, openedAt: null },
        data: { openedAt: now },
      });
      if (claimed.count === 0) {
        const still = await tx.chest.findFirst({
          where: { id: chestId, userId },
          select: { openedAt: true },
        });
        if (!still) throw new NotFoundException('Cofre no encontrado');
        throw new ConflictException('Cofre ya abierto');
      }

      // 2) Resolución de drops. El drop destacado (primer) porta la garantía de pity (US4).
      const results: DropItem[] = [];
      for (let i = 0; i < dropsPerChest; i++) {
        const res = this.dropEngine.resolveDrop(
          { dropTable: chestCfg.dropTable },
          chestCfg.tierWeights,
          qtyRange,
          i === 0 ? pityState : undefined,
        );
        let qty = res.qty;
        let bonusCoins = 0;
        if (qty > MAX_QTY_PER_DROP) {
          bonusCoins = qty - MAX_QTY_PER_DROP;
          qty = MAX_QTY_PER_DROP;
        }
        await tx.inventoryItem.upsert({
          where: { userId_itemId: { userId, itemId: res.itemId } },
          update: { qty: { increment: qty } },
          create: { userId, itemId: res.itemId, qty },
        });
        if (bonusCoins > 0) {
          await tx.user.updateMany({
            where: { id: userId },
            data: { coins: { increment: bonusCoins } },
          });
        }
        results.push({
          itemId: res.itemId,
          name: this.itemName(res.itemId),
          qty,
          tier: res.tier,
          isNew: !hadItems.has(res.itemId),
        });
      }

      // 3) Persistir los drops resueltos en el cofre.
      await tx.chest.update({ where: { id: chestId }, data: { drops: results as unknown as Prisma.InputJsonValue } });

      // 4) Pity: cualquier drop >= minTier resetea el contador; si no, se incrementa (FR-007).
      const anyMeets = results.some((d) => tierRank(d.tier as DropTier) >= tierRank(minTier));
      if (anyMeets) {
        await this.chestPityService.resetPity(userId, existing.type, tx);
      } else {
        await this.chestPityService.incrementPity(userId, existing.type, tx);
      }

      return results;
    });

    const pityAfter = await this.chestPityService.getPity(userId, existing.type);

    // FR-012 / T018 (US2 AC#5): revelar la apertura en tiempo real. Tras la transacción exitosa se
    // emite `chest:opened` al usuario (room `user:${userId}`); si no hay conexión activa, el evento
    // se descarta y el cliente lo reconstruye desde GET /chests/history. El payload omite `isNew`,
    // campo exclusivo de la respuesta REST (ver contracts/api-contract.md § chest:opened).
    this.realtime.emitToUser(userId, 'chest:opened', {
      chestId: existing.id,
      type: existing.type,
      drops: drops.map((d) => ({ itemId: d.itemId, name: d.name, qty: d.qty, tier: d.tier })),
    });

    return {
      chest: {
        id: existing.id,
        type: existing.type,
        source: existing.source,
        createdAt: existing.createdAt,
        openedAt: now,
      },
      drops,
      pityProgress: {
        count: pityAfter.count,
        threshold,
        minTier,
      },
    };
  }

  // ---------- US3: compra directa con monedas/gemas ----------

  /**
   * Compra un cofre (FR-008/FR-009/FR-010). Solo `bronze/silver/gold`; el descuento de saldo y la
   * creación del cofre son atómicos (condición `saldo >= precio`), y el límite de 5 compras/día se
   * calcula por la medianoche local del usuario (timezone).
   */
  async purchaseChest(
    userId: string,
    type: string,
    paymentMethod: string,
  ): Promise<PurchaseChestResponse> {
    if (!PURCHASABLE_TYPES.includes(type as (typeof PURCHASABLE_TYPES)[number])) {
      throw new BadRequestException('Tipo de cofre no comprable');
    }
    if (paymentMethod !== 'coins' && paymentMethod !== 'gems') {
      throw new BadRequestException('Método de pago inválido');
    }

    const chestCfg = this.chestsConfig()[type];
    const price =
      paymentMethod === 'coins' ? chestCfg?.prices?.coins : chestCfg?.prices?.gems;
    if (typeof price !== 'number') {
      throw new BadRequestException('Tipo de cofre no comprable');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { coins: true, gems: true, timezone: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const limit =
      typeof this.chestsConfig().maxPurchasesPerDay === 'number'
        ? this.chestsConfig().maxPurchasesPerDay
        : 5;
    const startOfDay = this.startOfDayInTimezone(user.timezone);
    const purchasesToday = await this.prisma.chest.count({
      where: { userId, source: 'purchase', createdAt: { gte: startOfDay } },
    });
    if (purchasesToday >= limit) {
      throw new ConflictException('Límite de compras diarias alcanzado');
    }

    const balance = paymentMethod === 'coins' ? user.coins : user.gems;
    if (balance < price) throw new BadRequestException('Saldo insuficiente');

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      // Cobro atómico race-safe vía la primitiva compartida (C-01): comprobación + descuento en 1 sentencia.
      const { ok } = await this.wallet.debit(tx, userId, paymentMethod as 'coins' | 'gems', price);
      if (!ok) throw new BadRequestException('Saldo insuficiente');

      const chest = await tx.chest.create({
        data: { userId, type, source: 'purchase', createdAt: now },
      });
      const updated = await tx.user.findUnique({
        where: { id: userId },
        select: { coins: true, gems: true },
      });
      return { chest, coins: updated!.coins, gems: updated!.gems };
    });

    // Notificación en tiempo real (solo si hay conexión; si no, el cliente la reconstruye del historial).
    this.realtime.emitToUser(userId, 'chest:unlocked', {
      chestId: result.chest.id,
      type,
      source: 'purchase',
    });

    return {
      chest: {
        id: result.chest.id,
        type: result.chest.type,
        source: result.chest.source,
        createdAt: result.chest.createdAt,
      },
      coinsRemaining: result.coins,
      gemsRemaining: result.gems,
    };
  }

  // ---------- US5: historial paginado de aperturas ----------

  /**
   * Historial de aperturas (FR-011): paginado, ordenado por `openedAt` descendente, capped en 100.
   */
  async getChestHistory(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<ChestHistoryResponse> {
    const take = Math.min(Math.max(1, Math.floor(limit) || HISTORY_PAGE_DEFAULT), HISTORY_PAGE_MAX);
    const skip = Math.max(0, Math.floor(offset) || 0);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.chest.findMany({
        where: { userId, openedAt: { not: null } },
        orderBy: { openedAt: 'desc' },
        take,
        skip,
        select: { id: true, type: true, openedAt: true, drops: true },
      }),
      this.prisma.chest.count({ where: { userId, openedAt: { not: null } } }),
    ]);

    return {
      openings: rows.map((r) => ({
        chestId: r.id,
        type: r.type,
        drops: (r.drops as unknown as DropItem[] | null) ?? [],
        openedAt: r.openedAt as Date,
      })),
      total,
    };
  }

  // ---------- Utilidades de timezone (medianoche local del usuario) ----------

  /** Fecha (en UTC) de la medianoche local del usuario para el día en curso (límite diario de compras). */
  private startOfDayInTimezone(timezone: string, now = new Date()): Date {
    const z = this.zonedParts(timezone, now);
    const asUTC = Date.UTC(z.year, z.month - 1, z.day);
    // Doble corrección del offset (cubre DST).
    const corrected = asUTC - this.tzOffsetMs(timezone, asUTC - this.tzOffsetMs(timezone, asUTC));
    return new Date(corrected);
  }

  private zonedParts(
    timezone: string,
    date: Date,
  ): { year: number; month: number; day: number } {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    return { year: get('year'), month: get('month'), day: get('day') };
  }

  private tzOffsetMs(timezone: string, ts: number): number {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date(ts));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    let hour = get('hour');
    if (hour === 24) hour = 0;
    const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
    return asUTC - ts;
  }
}