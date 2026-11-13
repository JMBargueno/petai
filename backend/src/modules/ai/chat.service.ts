import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PetsService } from '../pets/pets.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AiConfigService } from './ai-config.service';
import { MemoryService } from './memory.service';
import { ChatMessageInput, LlmProvider } from './llm-provider';
import { INTELLIGENCE_MAX, MEMORY_UNLOCK, buildSystemPrompt, intelligenceTier } from './personality';

export type ChatStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; message: { id: string; content: string }; intelligence: number; tier: string }
  | { type: 'error'; message: string };

export const MAX_MESSAGE_CHARS = 1000;
const HISTORY_MESSAGES = 20;
const HISTORY_CHAR_BUDGET = 6000;
const RATE_LIMIT = { max: 20, windowMs: 60_000 };

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  // Ventana deslizante en memoria. Con varias instancias del backend debe pasar a Redis.
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly petsService: PetsService,
    private readonly aiConfig: AiConfigService,
    private readonly realtime: RealtimeGateway,
    private readonly memory: MemoryService,
  ) {}

  private checkRateLimit(userId: string) {
    const now = Date.now();
    const recent = (this.hits.get(userId) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
    if (recent.length >= RATE_LIMIT.max) {
      throw new HttpException('Demasiados mensajes seguidos, espera un momento', HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    this.hits.set(userId, recent);
  }

  /** Normaliza y valida el mensaje del usuario. */
  sanitizeInput(raw: unknown): string {
    if (typeof raw !== 'string') throw new BadRequestException('message es obligatorio');
    // Se eliminan caracteres de control (salvo saltos de línea y tabulaciones)
    const text = raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
    if (!text) throw new BadRequestException('El mensaje no puede estar vacío');
    if (text.length > MAX_MESSAGE_CHARS) {
      throw new BadRequestException(`El mensaje supera los ${MAX_MESSAGE_CHARS} caracteres`);
    }
    return text;
  }

  async getHistory(userId: string, petId: string, limit = 50) {
    await this.petsService.getPetById(userId, petId); // valida pertenencia
    const take = Math.min(Math.max(1, Math.floor(limit) || 50), 100);
    const rows = await this.prisma.chatMessage.findMany({
      where: { petId, role: { in: ['user', 'assistant'] } },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return rows.reverse().map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    }));
  }

  /**
   * Flujo de chat. Las validaciones (pertenencia, config, límites) se hacen
   * antes de devolver el iterador, de modo que el controlador puede responder
   * con un código HTTP normal antes de abrir el flujo SSE.
   */
  async prepare(userId: string, petId: string, rawMessage: unknown, signal?: AbortSignal) {
    const message = this.sanitizeInput(rawMessage);
    const pet = await this.petsService.getPetById(userId, petId);
    const { provider, model } = await this.aiConfig.resolveProvider(userId);
    this.checkRateLimit(userId);

    const owner = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });

    const past = await this.prisma.chatMessage.findMany({
      where: { petId, role: { in: ['user', 'assistant'] } },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_MESSAGES,
    });
    const history: ChatMessageInput[] = [];
    let budget = HISTORY_CHAR_BUDGET;
    for (const m of past) {
      budget -= m.content.length;
      if (budget < 0) break;
      history.unshift({ role: m.role as 'user' | 'assistant', content: m.content });
    }

    // Memoria (intelligence ≥ 200): recuerdos relevantes en el prompt de sistema
    let systemPrompt = buildSystemPrompt(pet, owner ?? {});
    if ((pet.intelligence ?? 0) >= MEMORY_UNLOCK) {
      const block = await this.memory.recall(pet.id, message);
      if (block) systemPrompt += `

${block}`;
    }

    const messages: ChatMessageInput[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: message },
    ];

    return { events: this.run(userId, pet, message, messages, provider, model, signal) };
  }

  private async *run(
    userId: string,
    pet: any,
    userMessage: string,
    messages: ChatMessageInput[],
    provider: LlmProvider,
    model: string,
    signal?: AbortSignal,
  ): AsyncGenerator<ChatStreamEvent> {
    let reply = '';
    let tokens = 0;
    try {
      for await (const ev of provider.chat(messages, { model, maxTokens: 300, signal })) {
        if (ev.type === 'delta') {
          reply += ev.text;
          yield { type: 'delta', text: ev.text };
        } else if (ev.type === 'done') {
          tokens = (ev.usage?.promptTokens ?? 0) + (ev.usage?.completionTokens ?? 0);
        }
      }
    } catch (err: any) {
      if (signal?.aborted) return; // el cliente cerró la conexión
      this.logger.warn(`Fallo del proveedor de IA: ${err?.message}`);
      yield { type: 'error', message: err?.message || 'Error del proveedor de IA' };
      return;
    }

    if (!reply.trim()) {
      yield { type: 'error', message: 'El proveedor no devolvió ninguna respuesta' };
      return;
    }

    // Solo se persiste el intercambio si se completó
    // Marcas de tiempo explícitas y distintas para que el historial conserve el orden
    const at = Date.now();
    await this.prisma.chatMessage.create({
      data: { petId: pet.id, role: 'user', content: userMessage, createdAt: new Date(at) },
    });
    const saved = await this.prisma.chatMessage.create({
      data: { petId: pet.id, role: 'assistant', content: reply, tokens, createdAt: new Date(at + 1) },
    });

    const intelligence = Math.min(INTELLIGENCE_MAX, (pet.intelligence ?? 0) + 1);
    const updated = await this.prisma.pet.update({
      where: { id: pet.id },
      data: { intelligence, awakened: true },
      include: { species: true, pattern: true },
    });
    this.realtime.emitPetUpdate(userId, updated);

    // En segundo plano: no retrasa la respuesta ni puede romper el chat
    void this.memory.maybeSummarize(pet.id, intelligence, provider, model);

    yield {
      type: 'done',
      message: { id: saved.id, content: reply },
      intelligence,
      tier: intelligenceTier(intelligence),
    };
  }
}
