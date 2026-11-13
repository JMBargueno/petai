import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmProvider } from './llm-provider';
import {
  EXTRACTION_SYSTEM_PROMPT,
  MAX_FACTS,
  buildMemoryBlock,
  searchByKeywords,
  formatTranscript,
  normalizeForMatch,
  parseExtraction,
  selectRelevantFacts,
} from './memory';
import { MEMORY_UNLOCK } from './personality';
import { UsageService } from './usage.service';

/** Mensajes del usuario sin resumir que disparan una nueva extracción. */
const SUMMARIZE_EVERY_USER_MESSAGES = 6;
/** Pausa mínima entre intentos por mascota (protege el gasto de la key del usuario). */
const RETRY_COOLDOWN_MS = 2 * 60 * 1000;

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);
  private readonly inflight = new Set<string>();
  private readonly lastAttempt = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: UsageService,
  ) {}

  /** Bloque de recuerdos para el prompt (vacío si la mascota aún no tiene memoria). */
  async recall(petId: string, message: string): Promise<string> {
    const [facts, summaries] = await Promise.all([
      this.prisma.petMemory.findMany({
        where: { petId, kind: 'fact' },
        orderBy: { createdAt: 'desc' },
        take: MAX_FACTS,
      }),
      this.prisma.petMemory.findMany({
        where: { petId, kind: 'summary' },
        orderBy: { createdAt: 'desc' },
        take: 2,
      }),
    ]);
    return buildMemoryBlock(selectRelevantFacts(facts, message, 8), summaries);
  }

  /** Búsqueda por palabras clave en los recuerdos (herramienta search_memory). */
  async search(petId: string, query: string, limit = 5): Promise<string[]> {
    const items = await this.prisma.petMemory.findMany({
      where: { petId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return searchByKeywords(items, query, limit).map((m) => m.content);
  }

  /**
   * Si hay suficientes mensajes nuevos, resume la conversación y extrae hechos.
   * Se ejecuta en segundo plano: nunca debe romper ni retrasar el chat.
   */
  async maybeSummarize(
    petId: string,
    intelligence: number,
    provider: LlmProvider,
    model: string,
    userId: string,
    mode: string,
  ) {
    if (intelligence < MEMORY_UNLOCK || this.inflight.has(petId)) return;
    const last = this.lastAttempt.get(petId) ?? 0;
    if (Date.now() - last < RETRY_COOLDOWN_MS) return;

    // Se marca en curso ANTES de cualquier await: así dos llamadas simultáneas no pasan a la vez
    this.inflight.add(petId);
    try {
      // La extracción también consume tokens de la key: respeta la cuota mensual
      if (!(await this.usage.hasQuota(userId, mode))) return;

      const lastMemory = await this.prisma.petMemory.findFirst({
        where: { petId, kind: 'summary' },
        orderBy: { createdAt: 'desc' },
      });
      const since = lastMemory?.createdAt ?? new Date(0);
      const recent = await this.prisma.chatMessage.findMany({
        where: { petId, role: { in: ['user', 'assistant'] }, createdAt: { gt: since } },
        orderBy: { createdAt: 'asc' },
        take: 40,
      });
      if (recent.filter((m) => m.role === 'user').length < SUMMARIZE_EVERY_USER_MESSAGES) return;

      this.lastAttempt.set(petId, Date.now());
      let output = '';
      let reported = 0;
      const transcript = formatTranscript(recent);
      for await (const ev of provider.chat(
        [
          { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
          { role: 'user', content: transcript },
        ],
        { model, temperature: 0, maxTokens: 400 },
      )) {
        if (ev.type === 'delta') output += ev.text;
        else if (ev.type === 'done') reported = (ev.usage?.promptTokens ?? 0) + (ev.usage?.completionTokens ?? 0);
      }
      await this.usage.record(userId, reported || Math.ceil((transcript.length + output.length + EXTRACTION_SYSTEM_PROMPT.length) / 4));

      const extraction = parseExtraction(output);
      if (!extraction) {
        this.logger.warn(`Extracción de memoria sin formato válido (mascota ${petId})`);
        return;
      }
      await this.store(petId, extraction.summary, extraction.facts, recent[recent.length - 1].createdAt);
    } catch (err: any) {
      this.logger.warn(`No se pudo actualizar la memoria (mascota ${petId}): ${err?.message}`);
    } finally {
      this.inflight.delete(petId);
    }
  }

  private async store(petId: string, summary: string, facts: string[], processedUpTo: Date) {
    const existing = await this.prisma.petMemory.findMany({
      where: { petId, kind: 'fact' },
      orderBy: { createdAt: 'asc' },
    });
    const known = new Set(existing.map((f) => normalizeForMatch(f.content)));
    const fresh = facts.filter((f) => !known.has(normalizeForMatch(f)));

    // El resumen marca hasta dónde se ha procesado la conversación, aunque no haya hechos nuevos
    await this.prisma.petMemory.create({
      data: {
        petId,
        kind: 'summary',
        content: summary || 'Conversación sin datos relevantes.',
        // Marca del último mensaje procesado: los llegados durante la extracción no se pierden
        createdAt: processedUpTo,
      },
    });
    for (const content of fresh) {
      await this.prisma.petMemory.create({ data: { petId, kind: 'fact', content } });
    }

    // Tope de hechos: se descartan los más antiguos
    const overflow = existing.length + fresh.length - MAX_FACTS;
    if (overflow > 0) {
      await this.prisma.petMemory.deleteMany({
        where: { id: { in: existing.slice(0, overflow).map((f) => f.id) } },
      });
    }
  }

  async list(userId: string, petId: string) {
    const pet = await this.requirePet(userId, petId);
    const items = await this.prisma.petMemory.findMany({
      where: { petId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      unlocked: pet.intelligence >= MEMORY_UNLOCK,
      unlockAt: MEMORY_UNLOCK,
      intelligence: pet.intelligence,
      memories: items.map((m) => ({ id: m.id, kind: m.kind, content: m.content, createdAt: m.createdAt })),
    };
  }

  async remove(userId: string, petId: string, memoryId: string) {
    await this.requirePet(userId, petId);
    const res = await this.prisma.petMemory.deleteMany({ where: { id: memoryId, petId } });
    if (res.count === 0) throw new NotFoundException('Recuerdo no encontrado');
    return { deleted: 1 };
  }

  async clear(userId: string, petId: string) {
    await this.requirePet(userId, petId);
    const res = await this.prisma.petMemory.deleteMany({ where: { petId } });
    return { deleted: res.count };
  }

  private async requirePet(userId: string, petId: string) {
    const pet = await this.prisma.pet.findFirst({
      where: { id: petId, userId },
      select: { id: true, intelligence: true },
    });
    if (!pet) throw new NotFoundException('Mascota no encontrada');
    return pet;
  }
}
