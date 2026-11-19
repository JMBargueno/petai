import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementService } from '../billing/entitlement.service';
import { MetricsService } from '../../observability/metrics.service';
import { intelligenceTier } from '../ai/personality';
import { MemoryLayer } from './mind.types';
import { DIGEST_PREFIX, digestView, foldEpisodes, groupOf, normalizeDigests, type Digests } from '@pockai/mind/node';
import { MindService } from './mind.service';
import { hasText, text } from './strings';
import { floorValence, isStage, nextStage, type Shareable, type Stage } from './social.engine';
import {
  MemoryRow,
  RecallOptions,
  RecallSelection,
  buildLayeredMemoryBlock,
  capacityFor,
  layerOf,
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
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  private async planOf(userId: string): Promise<string> {
    if (!this.entitlements) return 'free';
    return this.entitlements.planFor(userId).catch(() => 'free');
  }

  /** Cadencia de extracción antes del nivel de memoria (mensajes del entrenador); 0 = desactivada. */
  earlyExtractEvery(): number {
    return this.mind.config().memory.earlyExtractEvery ?? 0;
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

  /**
   * Lo que la pizarra de situación necesita de la memoria, en una sola consulta: los episodios
   * recientes y las relaciones. Nunca la capa semántica (lo aprendido del entrenador no hace falta
   * para decidir y así no puede colarse donde no debe).
   */
  async situationRows(petId: string): Promise<MemoryRow[]> {
    return (await this.prisma.petMemory.findMany({
      where: { petId, layer: { in: ['episodic', 'emotional'] } },
      orderBy: { createdAt: 'desc' },
      take: 80,
    })) as unknown as MemoryRow[];
  }

  /** Etapa de la relación de una mascota con un sujeto (`pet:<id>`, `user:<id>`); desconocido si no hay fila. */
  async stageWith(petId: string, subject: string): Promise<Stage> {
    const row = await this.prisma.petMemory.findUnique({ where: { petId_key: { petId, key: `emo:${subject}` } } });
    return isStage((row as any)?.stage) ? (row as any).stage : 'stranger';
  }

  /**
   * Episodios propios que una mascota podría contar o regalar a otro Pockai: recientes, sin
   * sujeto y sin clave (lo nacido del chat, los deseos y los trucos la llevan). El filtro fino
   * (lista blanca de orígenes) es de `social.engine.isShareable`.
   */
  async shareableEpisodes(petId: string, kinds: string[], since: Date): Promise<Shareable[]> {
    return this.prisma.petMemory.findMany({
      where: { petId, layer: 'episodic', key: null, subject: null, kind: { in: kinds }, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, kind: true, content: true, key: true, subject: true, createdAt: true },
    });
  }

  /** Cómo acabó el último encuentro con alguien (valencia del recuerdo); `null` si no hay ninguno. */
  async lastEncounterMood(petId: string, subject: string): Promise<number | null> {
    const row = await this.prisma.petMemory.findFirst({
      where: { petId, layer: 'episodic', subject, kind: { in: ['encounter', 'visit'] } },
      orderBy: { createdAt: 'desc' },
      select: { valence: true },
    });
    return row ? row.valence : null;
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
    if (!evict.length) return;
    const gone = new Set(evict);
    // Antes de olvidar, lo vivido se pliega en un resumen: se pierde el detalle, no el hecho
    await this.consolidate(petId, rows.filter((r) => gone.has(r.id)), rows);
    await this.prisma.petMemory.deleteMany({ where: { id: { in: evict }, petId } });
  }

  /** Texto del resumen de un grupo; `null` si no se sabe cómo llamar a quien toca. */
  private digestText(view: NonNullable<ReturnType<typeof digestView>>, rows: readonly MemoryRow[]): string | null {
    const group = view.group.toUpperCase();
    const id = `DIGEST_${group}_${view.amount.toUpperCase()}`;
    if (!hasText(id)) return null;
    let who: string | undefined;
    if (view.subject) {
      // Su nombre está en la relación; sin ella no hay con quién
      who = rows.find((r) => r.key === `emo:${view.subject}`)?.content;
      if (!who) return null;
    }
    const tone = `DIGEST_${group}_TONE_${view.tone.toUpperCase()}`;
    return [text(id, { friend: who, visitor: who }), hasText(tone) ? text(tone) : ''].filter(Boolean).join(' ');
  }

  /**
   * Pliega los episodios que se van a olvidar en los resúmenes de su grupo (spec 41, fase E).
   * Los contadores viven en `Pet.personality.digests` y el resumen es un recuerdo más de la capa
   * semántica (clave `sum:…`). Nunca rompe el guardado: si falla, se olvida como antes.
   */
  private async consolidate(petId: string, evicted: readonly MemoryRow[], rows: readonly MemoryRow[]) {
    const cfg = this.mind.config().memory.consolidation;
    if (!cfg) return;
    const episodes = evicted
      .filter((r) => layerOf(r) === 'episodic')
      .map((r) => ({ kind: r.kind, subject: r.subject, key: r.key, valence: r.valence, at: r.createdAt.getTime() }));
    if (!episodes.some((e) => groupOf(e, cfg))) return;
    try {
      const pet = await this.prisma.pet.findUnique({ where: { id: petId }, select: { personality: true } });
      const result = foldEpisodes(normalizeDigests((pet as any)?.personality?.digests), episodes, cfg);
      await this.mind.patchStored(petId, { digests: result.digests });
      for (const key of result.touched) {
        const view = digestView(key, result.digests[key], cfg);
        const content = view && this.digestText(view, rows);
        if (!view || !content) continue;
        const data = { layer: 'semantic', kind: 'digest', content, importance: view.importance, valence: result.digests[key].valence, subject: view.subject };
        await this.prisma.petMemory.upsert({ where: { petId_key: { petId, key } }, create: { petId, key, ...data }, update: data });
      }
      if (result.dropped.length) await this.prisma.petMemory.deleteMany({ where: { petId, key: { in: result.dropped } } });
    } catch (e: any) {
      this.logger.warn(`No se pudo consolidar la memoria de ${petId}: ${e?.message}`);
    }
  }

  /**
   * El entrenador ha pedido olvidar un resumen (o todo): se borran también sus contadores, para
   * que no reaparezca la próxima vez que se pliegue algo de ese grupo.
   */
  async forgetDigests(petId: string, key?: string | null) {
    if (key && !key.startsWith(DIGEST_PREFIX)) return;
    try {
      const pet = await this.prisma.pet.findUnique({ where: { id: petId }, select: { personality: true } });
      const digests: Digests = key ? normalizeDigests((pet as any)?.personality?.digests) : {};
      if (key) delete digests[key];
      await this.mind.patchStored(petId, { digests });
    } catch (e: any) {
      this.logger.warn(`No se pudieron olvidar los resúmenes de ${petId}: ${e?.message}`);
    }
  }

  /** Bloque de recuerdos relevantes para este mensaje, dentro del presupuesto del plan. */
  async recallBlock(petId: string, message: string, budgetKey: string, now = new Date(), opts: RecallOptions = {}): Promise<string> {
    const cfg = this.mind.config();
    const rows = (await this.prisma.petMemory.findMany({
      where: { petId },
      orderBy: { createdAt: 'desc' },
      take: LOAD_LIMIT,
    })) as unknown as MemoryRow[];
    const budget = cfg.memory.promptBudgetChars[budgetKey] ?? cfg.memory.promptBudgetChars.free ?? 700;
    const sel = selectForPrompt(rows, message, now, cfg, budget, opts);
    if (this.metrics) {
      const matched = new Set(sel.matched);
      for (const layer of ['episodic', 'semantic', 'emotional'] as const) {
        const hit = sel[layer].filter((m) => matched.has(m.id)).length;
        this.metrics.recordMindRecall(layer, hit, sel[layer].length - hit);
      }
    }
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
