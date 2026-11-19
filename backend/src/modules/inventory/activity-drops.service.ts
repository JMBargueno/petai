import { Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { GameDataService } from '../game-data/game-data.service';

/** Actividades que pueden soltar objetos (`balance.activityDrops.sources`). */
export type ActivityDropSource = 'minigame' | 'training' | 'adventure' | 'battleWin' | 'explore';

export interface ActivityDrop {
  itemId: string;
  name: string;
  qty: number;
}

interface DropRule {
  itemId: string;
  chance: number;
}

/**
 * Drops de actividades (spec 41): al terminar una partida, un entrenamiento, una aventura, un
 * combate ganado o una exploración autónoma, el servidor tira por los objetos configurados en
 * `balance.activityDrops`. Como mucho cae un objeto por tirada, nunca uno oculto (`hidden`, solo lo
 * da el admin) y cada objeto respeta su tope diario (`dailyCaps`, en días UTC). Los cofres no pasan
 * por aquí: su tabla de drop es aparte y no cuenta para el tope.
 */
@Injectable()
export class ActivityDropsService {
  private readonly logger = new Logger(ActivityDropsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
  ) {}

  /** Tira por los objetos de `source` y entrega el primero que caiga. */
  async roll(userId: string, source: ActivityDropSource, rng: () => number = defaultRng): Promise<ActivityDrop | null> {
    try {
      const rules = this.rules(source);
      for (const rule of rules) {
        if (!(rng() < rule.chance)) continue;
        const granted = await this.grant(userId, rule.itemId);
        if (granted) return granted;
      }
    } catch (err) {
      // Un drop es un extra: nunca debe tumbar la actividad que lo dispara.
      this.logger.warn(`activityDrops.${source}: ${(err as Error).message}`);
    }
    return null;
  }

  /**
   * Entrega una unidad de `itemId` si existe, no es oculto y no ha llegado a su tope diario.
   * El tope se reserva con un incremento condicional para que dos actividades simultáneas no lo
   * superen.
   */
  async grant(userId: string, itemId: string): Promise<ActivityDrop | null> {
    const food = (this.gameData.getFoods() ?? []).find((f: any) => f.id === itemId);
    if (!food || food.availability === 'hidden') return null;
    const item = await this.prisma.item.findUnique({ where: { id: itemId }, select: { id: true, name: true } });
    if (!item) return null;

    const cap = this.dailyCap(itemId);
    if (cap !== undefined) {
      if (cap <= 0) return null;
      const day = utcDay();
      await this.prisma.dailyItemDrop.upsert({
        where: { userId_itemId_day: { userId, itemId, day } },
        update: {},
        create: { userId, itemId, day, count: 0 },
      });
      const reserved = await this.prisma.dailyItemDrop.updateMany({
        where: { userId, itemId, day, count: { lt: cap } },
        data: { count: { increment: 1 } },
      });
      if (reserved.count === 0) return null;
    }

    await this.prisma.inventoryItem.upsert({
      where: { userId_itemId: { userId, itemId } },
      update: { qty: { increment: 1 } },
      create: { userId, itemId, qty: 1 },
    });
    return { itemId, name: item.name, qty: 1 };
  }

  private rules(source: ActivityDropSource): DropRule[] {
    const list = this.gameData.getBalance()?.activityDrops?.sources?.[source];
    return Array.isArray(list) ? list.filter((r: any) => r && typeof r.itemId === 'string' && r.chance > 0) : [];
  }

  private dailyCap(itemId: string): number | undefined {
    const cap = this.gameData.getBalance()?.activityDrops?.dailyCaps?.[itemId];
    return typeof cap === 'number' ? cap : undefined;
  }
}

function defaultRng(): number {
  return randomInt(0, 1_000_000) / 1_000_000;
}

function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
