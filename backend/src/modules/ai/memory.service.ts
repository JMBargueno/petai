import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ManagedBudgetService } from '../billing/managed-budget.service';
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
import { getDesktopSkill, skillStateOf } from './desktop-skills';
import {
  DIGEST_MIN_INTERVAL_MS,
  MAX_HABITS_IN_PROMPT,
  deriveHabits,
  emptyProfile,
  mergeDigest,
  parseProfile,
  sanitizeDigest,
} from './habits';

/** Mensajes del usuario sin resumir que disparan una nueva extracción. */
const SUMMARIZE_EVERY_USER_MESSAGES = 6;
/** Pausa mínima entre intentos por mascota (protege el gasto de la key del usuario). */
const RETRY_COOLDOWN_MS = 2 * 60 * 1000;
/** Resúmenes que se conservan por mascota (antes crecían sin límite). */
export const MAX_SUMMARIES = 20;

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);
  private readonly inflight = new Set<string>();
  private readonly lastAttempt = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: UsageService,
    // IA gestionada: la extracción también gasta el presupuesto global del servidor
    @Optional() private readonly managedBudget?: ManagedBudgetService,
  ) {}

  /** Bloque de recuerdos para el prompt (vacío si la mascota aún no tiene memoria). */
  async recall(petId: string, message: string): Promise<string> {
    const [facts, summaries, habits] = await Promise.all([
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
      this.prisma.petMemory.findMany({
        where: { petId, kind: 'habit' },
        orderBy: { createdAt: 'desc' },
        take: MAX_HABITS_IN_PROMPT,
      }),
    ]);
    return buildMemoryBlock(selectRelevantFacts(facts, message, 8), summaries, habits);
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
    // Gestionada: "extraer cada N mensajes" del plan (panel de facturación); 0 = extracción desactivada
    everyUserMessages = SUMMARIZE_EVERY_USER_MESSAGES,
  ) {
    if (everyUserMessages <= 0) return;
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
      if (recent.filter((m) => m.role === 'user').length < everyUserMessages) return;

      const managed = mode === 'managed' && !!this.managedBudget;
      // Gestionada: la extracción es prescindible, así que solo se hace con el presupuesto del plan Free abierto
      if (managed && !(await this.managedBudget!.assertOpen('free').then(() => true, () => false))) return;

      this.lastAttempt.set(petId, Date.now());
      let output = '';
      let reported = 0;
      let reportedCost: number | undefined;
      let promptTokens = 0;
      let completionTokens = 0;
      const transcript = formatTranscript(recent);
      for await (const ev of provider.chat(
        [
          { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
          { role: 'user', content: transcript },
        ],
        { model, temperature: 0, maxTokens: 400 },
      )) {
        if (ev.type === 'delta') output += ev.text;
        else if (ev.type === 'done') {
          promptTokens = ev.usage?.promptTokens ?? 0;
          completionTokens = ev.usage?.completionTokens ?? 0;
          reported = promptTokens + completionTokens;
          reportedCost = ev.usage?.costUsd;
        }
      }
      const used = reported || Math.ceil((transcript.length + output.length + EXTRACTION_SYSTEM_PROMPT.length) / 4);
      let costUsd = 0;
      if (managed) {
        costUsd = reportedCost ?? (reported ? this.managedBudget!.estimateCostUsd(promptTokens, completionTokens) : this.managedBudget!.estimateCostUsd(used, 0));
        await this.managedBudget!.add(costUsd).catch(() => undefined);
      }
      await this.usage.record(userId, used, costUsd, managed ? 'openrouter' : undefined);

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

    // Tope de resúmenes: se conservan los más recientes. El último (por createdAt) es la marca
    // de «procesado hasta» que lee maybeSummarize, así que nunca se borra.
    const stale = await this.prisma.petMemory.findMany({
      where: { petId, kind: 'summary' },
      orderBy: { createdAt: 'desc' },
      skip: MAX_SUMMARIES,
      select: { id: true },
    });
    if (stale.length) {
      await this.prisma.petMemory.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
    }
  }

  // ---------- Hábitos de escritorio (memoria contextual sincronizada) ----------

  /**
   * Recibe el resumen diario del escritorio, lo fusiona en el perfil de tamaño fijo y
   * reescribe los hábitos derivados (upsert por clave). Vive en el servidor, así que se
   * sincroniza solo entre dispositivos, y el almacenamiento por mascota está acotado.
   */
  async ingestDigest(userId: string, petId: string, raw: unknown, now = new Date()) {
    const pet = await this.prisma.pet.findFirst({
      where: { id: petId, userId },
      select: { id: true, intelligence: true, bonding: true, desktopSkills: true },
    });
    if (!pet) throw new NotFoundException('Mascota no encontrada');

    // El servidor decide qué partes acepta según las habilidades (no se fía del cliente)
    const active = (id: string) => skillStateOf(getDesktopSkill(id)!, pet.desktopSkills as any, pet).state === 'active';
    const res = sanitizeDigest(raw, { apps: active('context_awareness'), pomodoro: active('pomodoro_companion') });
    if (res.ok === false) throw new BadRequestException(res.error);

    const row = await this.prisma.petContextProfile.findUnique({ where: { petId } });
    if (row && now.getTime() - row.lastDigestAt.getTime() < DIGEST_MIN_INTERVAL_MS) {
      throw new HttpException('Ya se recibió un resumen hace poco', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!res.digest.appMinutes && !res.digest.pomodoros) return { habits: 0, stored: false };

    const days = row ? (now.getTime() - row.lastDigestAt.getTime()) / 86_400_000 : 0;
    const profile = mergeDigest(row ? parseProfile(row.data) : emptyProfile(), res.digest, days);
    await this.prisma.petContextProfile.upsert({
      where: { petId },
      create: { petId, data: profile as any, lastDigestAt: now },
      update: { data: profile as any, lastDigestAt: now },
    });

    const habits = deriveHabits(profile);
    for (const h of habits) {
      await this.prisma.petMemory.upsert({
        where: { petId_key: { petId, key: h.key } },
        create: { petId, kind: 'habit', key: h.key, content: h.content },
        update: { content: h.content },
      });
    }
    // Los hábitos que ya no se cumplen desaparecen
    await this.prisma.petMemory.deleteMany({
      where: { petId, kind: 'habit', key: { notIn: habits.map((h) => h.key) } },
    });
    return { habits: habits.length, stored: true };
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
    const memory = await this.prisma.petMemory.findFirst({ where: { id: memoryId, petId }, select: { kind: true, key: true } });
    const res = await this.prisma.petMemory.deleteMany({ where: { id: memoryId, petId } });
    if (res.count === 0) throw new NotFoundException('Recuerdo no encontrado');
    // Un hábito borrado se silencia: el siguiente resumen del escritorio no lo vuelve a crear
    if (memory?.kind === 'habit' && memory.key) {
      const row = await this.prisma.petContextProfile.findUnique({ where: { petId } });
      if (row) {
        const profile = parseProfile(row.data);
        if (!profile.muted.includes(memory.key)) profile.muted.push(memory.key);
        await this.prisma.petContextProfile.update({ where: { petId }, data: { data: profile as any } });
      }
    }
    return { deleted: 1 };
  }

  async clear(userId: string, petId: string) {
    await this.requirePet(userId, petId);
    const res = await this.prisma.petMemory.deleteMany({ where: { petId } });
    // «Olvidar todo» borra también el perfil de hábitos del que salen
    await this.prisma.petContextProfile.deleteMany({ where: { petId } });
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
