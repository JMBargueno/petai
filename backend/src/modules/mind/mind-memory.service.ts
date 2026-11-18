import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementService } from '../billing/entitlement.service';
import { intelligenceTier } from '../ai/personality';
import { MemoryLayer } from './mind.types';
import { MindService } from './mind.service';
import {
  MemoryRow,
  buildLayeredMemoryBlock,
  capacityFor,
  nextValence,
  pickEvictions,
  safeMemoryText,
  selectForPrompt,
} from './memory.engine';

export interface RememberInput {
  layer: MemoryLayer;
  kind: string;
  content: string;
  importance: number;
  valence?: number;
  subject?: string | null;
  key?: string | null;
  createdAt?: Date;
}

const LOAD_LIMIT = 400;

/**
 * Memory Engine con estado (spec 36): escribe recuerdos estructurados en las tres capas,
 * mantiene la capacidad (olvido por retención) y selecciona lo relevante para cada interacción.
 */
@Injectable()
export class MindMemoryService {
  private readonly logger = new Logger(MindMemoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mind: MindService,
    @Optional() private readonly entitlements?: EntitlementService,
  ) {}

  private async planOf(userId: string): Promise<string> {
    if (!this.entitlements) return 'free';
    return this.entitlements.planFor(userId).catch(() => 'free');
  }

  async capacity(petId: string) {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId }, select: { userId: true, intelligence: true } });
    if (!pet) return null;
    const plan = await this.planOf(pet.userId);
    return capacityFor(intelligenceTier(pet.intelligence ?? 0), plan, this.mind.config());
  }

  /** Guarda uno o varios recuerdos (los irrelevantes o sensibles se descartan) y aplica la capacidad. */
  async remember(petId: string, inputs: RememberInput[]): Promise<number> {
    const cfg = this.mind.config();
    let stored = 0;
    for (const input of inputs) {
      const content = safeMemoryText(input.content);
      if (!content) continue;
      if (input.importance < cfg.memory.minImportanceToStore && input.layer !== 'emotional') continue;
      const data = {
        petId,
        layer: input.layer,
        kind: input.kind,
        content,
        importance: Math.max(0, Math.min(1, input.importance)),
        valence: Math.max(-1, Math.min(1, input.valence ?? 0)),
        subject: input.subject ?? null,
        ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      };
      try {
        // Sin duplicados: el mismo episodio sin clave no se guarda dos veces el mismo día
        if (!input.key) {
          const at = input.createdAt ?? new Date();
          const dayStart = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
          const dup = await this.prisma.petMemory.findFirst({
            where: { petId, content, createdAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 86_400_000) } },
            select: { id: true },
          });
          if (dup) continue;
        }
        if (input.key) {
          await this.prisma.petMemory.upsert({
            where: { petId_key: { petId, key: input.key } },
            create: { ...data, key: input.key },
            update: { content, importance: data.importance, valence: data.valence },
          });
        } else {
          await this.prisma.petMemory.create({ data });
        }
        stored++;
      } catch (e: any) {
        this.logger.warn(`No se pudo guardar un recuerdo de ${petId}: ${e?.message}`);
      }
    }
    if (stored) await this.enforceCapacity(petId);
    return stored;
  }

  /**
   * Memoria emocional: una fila por sujeto. La valencia se mueve despacio (media móvil) y la
   * importancia crece con la familiaridad.
   */
  async feel(petId: string, subject: string, label: string, delta: number) {
    const key = `emo:${subject}`;
    const prev = await this.prisma.petMemory.findUnique({ where: { petId_key: { petId, key } } });
    const valence = nextValence(prev?.valence ?? 0, delta);
    const importance = Math.min(1, (prev?.importance ?? 0.35) + 0.05);
    await this.remember(petId, [
      { layer: 'emotional', kind: 'relation', key, subject, content: label, importance, valence },
    ]);
  }

  async enforceCapacity(petId: string) {
    const cap = await this.capacity(petId);
    if (!cap) return;
    const rows = (await this.prisma.petMemory.findMany({
      where: { petId },
      orderBy: { createdAt: 'desc' },
      take: LOAD_LIMIT,
    })) as unknown as MemoryRow[];
    const evict = pickEvictions(rows, cap, new Date(), this.mind.config());
    if (evict.length) await this.prisma.petMemory.deleteMany({ where: { id: { in: evict }, petId } });
  }

  /** Bloque de recuerdos relevantes para este mensaje, dentro del presupuesto del plan. */
  async recallBlock(petId: string, message: string, budgetKey: string, now = new Date()): Promise<string> {
    const cfg = this.mind.config();
    const rows = (await this.prisma.petMemory.findMany({
      where: { petId },
      orderBy: { createdAt: 'desc' },
      take: LOAD_LIMIT,
    })) as unknown as MemoryRow[];
    const budget = cfg.memory.promptBudgetChars[budgetKey] ?? cfg.memory.promptBudgetChars.free ?? 700;
    const sel = selectForPrompt(rows, message, now, cfg, budget);
    const used = [...sel.episodic, ...sel.semantic, ...sel.emotional].map((m) => m.id);
    if (used.length) {
      // Recordar refuerza: lo que se usa tarda más en olvidarse
      await this.prisma.petMemory.updateMany({ where: { id: { in: used } }, data: { lastRecalledAt: now } }).catch(() => undefined);
    }
    return buildLayeredMemoryBlock(sel, now);
  }

  async counts(petId: string) {
    const groups = await this.prisma.petMemory.groupBy({ by: ['layer'], where: { petId }, _count: { _all: true } });
    const out = { episodic: 0, semantic: 0, emotional: 0 } as Record<MemoryLayer, number>;
    for (const g of groups) if (g.layer in out) out[g.layer as MemoryLayer] = g._count._all;
    return out;
  }
}
