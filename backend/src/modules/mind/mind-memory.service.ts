import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementService } from '../billing/entitlement.service';
import { intelligenceTier } from '../ai/personality';
import { MemoryLayer } from './mind.types';
import { MindService } from './mind.service';
import { floorValence, isStage, nextStage, type Stage } from './social.engine';
import {
  MemoryRow,
  RecallSelection,
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
  /**
   * Con `key`: el recuerdo es algo que se repite (p. ej. «me dijo que me quiere»). En vez de
   * acumular uno por vez, se actualiza el mismo: pasa a ser de ahora y gana algo de importancia.
   */
  bump?: boolean;
  /** Etapa de la relación (solo en la capa emocional). */
  stage?: string;
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
        ...(input.stage ? { stage: input.stage } : {}),
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
          let importance = data.importance;
          let refreshed: { createdAt?: Date } = {};
          if (input.bump) {
            const prev = await this.prisma.petMemory.findUnique({
              where: { petId_key: { petId, key: input.key } },
              select: { importance: true },
            });
            if (prev) {
              importance = Math.max(
                data.importance,
                Math.min(cfg.memory.repeatCap, Math.max(prev.importance, data.importance) + cfg.memory.repeatBoost),
              );
            }
            // Vuelve a ser reciente: «hoy me dijo…», no «hace tres semanas»
            refreshed = { createdAt: input.createdAt ?? new Date() };
          }
          await this.prisma.petMemory.upsert({
            where: { petId_key: { petId, key: input.key } },
            create: { ...data, importance, key: input.key },
            update: { content, importance, valence: data.valence, ...(input.stage ? { stage: input.stage } : {}), ...refreshed },
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
  async feel(petId: string, subject: string, label: string, delta: number): Promise<{ valence: number; stage: Stage | null }> {
    const key = `emo:${subject}`;
    const social = this.mind.config().social;
    const prev = await this.prisma.petMemory.findUnique({ where: { petId_key: { petId, key } } });
    let valence = nextValence(prev?.valence ?? 0, delta);
    // Entre dos Pockai la relación tiene suelo: se pican, pero no se odian
    if (social && subject.startsWith('pet:')) valence = floorValence(valence, social);
    const importance = Math.min(1, (prev?.importance ?? 0.35) + 0.05);
    // La relación con el entrenador no va por etapas; con otros Pockai y otros entrenadores, sí
    const stage =
      social && subject !== 'owner'
        ? nextStage(isStage((prev as any)?.stage) ? (prev as any).stage : null, valence, importance, social)
        : null;
    await this.remember(petId, [
      { layer: 'emotional', kind: 'relation', key, subject, content: label, importance, valence, ...(stage ? { stage } : {}) },
    ]);
    return { valence, stage };
  }

  /** Etapa de la relación de una mascota con un sujeto (`pet:<id>`, `user:<id>`); desconocido si no hay fila. */
  async stageWith(petId: string, subject: string): Promise<Stage> {
    const row = await this.prisma.petMemory.findUnique({ where: { petId_key: { petId, key: `emo:${subject}` } } });
    return isStage((row as any)?.stage) ? (row as any).stage : 'stranger';
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
    await this.markRecalled(sel, now);
    return buildLayeredMemoryBlock(sel, now);
  }

  /**
   * Anota qué se inyectó. Solo lo que coincidió con el mensaje se refuerza (tarda más en
   * olvidarse); el resto únicamente apunta cuándo salió, para no repetirlo en el turno siguiente.
   * Nunca rompe el chat: si falla, el turno sigue sin la anotación.
   */
  private async markRecalled(sel: RecallSelection, now: Date) {
    const all = [...sel.episodic, ...sel.semantic, ...sel.emotional].map((m) => m.id);
    const matched = new Set(sel.matched);
    const reinforced = all.filter((id) => matched.has(id));
    const seen = all.filter((id) => !matched.has(id));
    try {
      if (reinforced.length) {
        // updateMany refresca `updatedAt` (@updatedAt), que es de donde la retención cuenta la edad
        await this.prisma.petMemory.updateMany({ where: { id: { in: reinforced } }, data: { lastRecalledAt: now } });
      }
      if (seen.length) {
        // SQL directo para no tocar `updatedAt`: haber salido en un prompt no es reforzarse
        await this.prisma.$executeRaw(
          Prisma.sql`UPDATE "PetMemory" SET "lastRecalledAt" = ${now} WHERE "id" IN (${Prisma.join(seen)})`,
        );
      }
    } catch (e: any) {
      this.logger.debug(`No se pudo anotar el recuerdo usado: ${e?.message}`);
    }
  }

  async counts(petId: string) {
    const groups = await this.prisma.petMemory.groupBy({ by: ['layer'], where: { petId }, _count: { _all: true } });
    const out = { episodic: 0, semantic: 0, emotional: 0 } as Record<MemoryLayer, number>;
    for (const g of groups) if (g.layer in out) out[g.layer as MemoryLayer] = g._count._all;
    return out;
  }
}
