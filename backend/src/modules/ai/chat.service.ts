import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PetsService } from '../pets/pets.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AiConfigService } from './ai-config.service';
import { MemoryService } from './memory.service';
import { AgentContext, AgentService } from './agent.service';
import { UsageService } from './usage.service';
import { sanitizeClientTools, toolDefinitions } from './agent-tools';
import { ChatMessageInput, LlmProvider, ToolCall } from './llm-provider';
import { ModerationVerdict, OutputGuard, moderateInput, moderateOutput } from './moderation';
import { randomUUID } from 'crypto';
import { safeTimeZone } from '../pets/sleep-cycle';
import { AGENT_UNLOCK, INTELLIGENCE_MAX, MEMORY_UNLOCK, buildSystemPrompt, intelligenceTier } from './personality';

export type ChatStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'action'; action: { id: string; tool: string; summary: string; expiresAt: Date; clientSide: boolean } }
  | { type: 'moderated'; reason: string; message: string; hideUserMessage: boolean }
  | { type: 'done'; message: { id: string; content: string }; intelligence: number; tier: string }
  | { type: 'error'; message: string };

export const MAX_MESSAGE_CHARS = 1000;
const HISTORY_MESSAGES = 20;
const HISTORY_CHAR_BUDGET = 6000;
const RATE_LIMIT = { max: 20, windowMs: 60_000 };
/** Vueltas máximas de herramientas por mensaje (la última se fuerza sin herramientas). */
const MAX_TOOL_ROUNDS = 3;
/** Modo Hermes local: vigencia de un turno y tamaño máximo de la respuesta sincronizada. */
const LOCAL_TURN_TTL_MS = 5 * 60 * 1000;
const LOCAL_MAX_TICKETS = 200;
const LOCAL_MAX_REPLY_CHARS = 4000;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  // Ventana deslizante: Redis (compartida entre instancias) con respaldo en memoria por instancia.
  private readonly hits = new Map<string, number[]>();
  // Una respuesta en curso por usuario (evita ráfagas paralelas que disparan el gasto)
  private readonly active = new Set<string>();
  // Turnos del modo Hermes local pendientes de sincronizar (un solo uso, en memoria)
  private readonly localTurns = new Map<string, { userId: string; petId: string; message: string; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly petsService: PetsService,
    private readonly aiConfig: AiConfigService,
    private readonly realtime: RealtimeGateway,
    private readonly memory: MemoryService,
    private readonly agent: AgentService,
    private readonly usage: UsageService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  private async checkRateLimit(userId: string) {
    const tooMany = () => new HttpException('Demasiados mensajes seguidos, espera un momento', HttpStatus.TOO_MANY_REQUESTS);
    const now = Date.now();
    if (this.redis) {
      const blocked = await this.redis.run(async (r) => {
        const k = this.redis!.key(`chatrate:${userId}`);
        await r.zremrangebyscore(k, 0, now - RATE_LIMIT.windowMs);
        if ((await r.zcard(k)) >= RATE_LIMIT.max) return true;
        await r.multi().zadd(k, now, `${now}-${Math.random().toString(36).slice(2, 8)}`).pexpire(k, RATE_LIMIT.windowMs).exec();
        return false;
      });
      if (blocked === true) throw tooMany();
      if (blocked === false) return;
    }
    const recent = (this.hits.get(userId) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
    if (recent.length >= RATE_LIMIT.max) throw tooMany();
    recent.push(now);
    this.hits.set(userId, recent);
  }

  /** Reinicia los contadores de mensajes por minuto de esos usuarios (memoria y Redis). Solo para tests. */
  async resetRateLimits(userIds: string[]) {
    for (const id of userIds) this.hits.delete(id);
    await this.redis?.run((r) => (userIds.length ? r.del(...userIds.map((id) => this.redis!.key(`chatrate:${id}`))) : Promise.resolve(0)));
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
   * Flujo de chat. Las validaciones (pertenencia, límites, moderación, config,
   * cuota) se hacen antes de devolver el iterador, de modo que el controlador
   * puede responder con un código HTTP normal antes de abrir el flujo SSE.
   */
  async prepare(
    userId: string,
    petId: string,
    rawMessage: unknown,
    signal?: AbortSignal,
    rawClientTools?: unknown,
  ) {
    const message = this.sanitizeInput(rawMessage);
    const pet = await this.petsService.getPetById(userId, petId);
    await this.checkRateLimit(userId);

    // Moderación de entrada: el mensaje bloqueado no llega al proveedor, no se guarda y no gasta cuota
    const verdict = moderateInput(message);
    if (verdict) {
      this.logger.warn(`Mensaje moderado (${verdict.reason}) en la mascota ${pet.id}`);
      return { events: this.moderatedOnly(verdict) };
    }

    const { provider, model, mode } = await this.aiConfig.resolveProvider(userId);
    await this.usage.assertWithinQuota(userId, mode);

    const { messages, timeZone, now } = await this.buildContext(userId, pet, message, 'agent');

    // Agente (intelligence ≥ 500): puede usar herramientas; los efectos requieren confirmación
    const agentCtx: AgentContext | undefined =
      (pet.intelligence ?? 0) >= AGENT_UNLOCK
        ? { userId, petId: pet.id, timeZone, now, clientTools: sanitizeClientTools(rawClientTools) }
        : undefined;

    return { events: this.run(userId, pet, message, messages, provider, model, mode, signal, agentCtx) };
  }

  /**
   * Prompt de sistema (personalidad + recuerdos), historial reciente y mensaje.
   * `maxTier` limita lo que el prompt promete: en modo local no hay herramientas.
   */
  private async buildContext(
    userId: string,
    pet: any,
    message: string,
    maxTier: 'chat' | 'memory' | 'agent',
  ) {
    const owner = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, timezone: true },
    });
    const order = ['chat', 'memory', 'agent'];
    const real = intelligenceTier(pet.intelligence ?? 0);
    const tier = order.indexOf(real) > order.indexOf(maxTier) ? maxTier : real;
    const timeZone = safeTimeZone(owner?.timezone);
    const now = new Date();

    const past = await this.prisma.chatMessage.findMany({
      where: { petId: pet.id, role: { in: ['user', 'assistant'] } },
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
    let systemPrompt = buildSystemPrompt(pet, owner ?? {}, { tier, now, timeZone });
    if ((pet.intelligence ?? 0) >= MEMORY_UNLOCK) {
      const block = await this.memory.recall(pet.id, message);
      if (block) systemPrompt += `\n\n${block}`;
    }

    const messages: ChatMessageInput[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: message },
    ];
    return { messages, timeZone, now };
  }

  // ---------- Modo Hermes local ----------
  // La inferencia la hace la app de escritorio contra un Hermes en el propio equipo
  // (el backend no puede alcanzar un loopback). El servidor sigue siendo quien construye
  // el prompt, modera la entrada y la salida y guarda el historial.
  // Límites: sin herramientas ni extracción de memoria, y la respuesta la afirma el cliente.

  /** Paso 1: valida y devuelve los mensajes a enviar al Hermes local, con un turno de un solo uso. */
  async prepareLocal(userId: string, petId: string, rawMessage: unknown) {
    const message = this.sanitizeInput(rawMessage);
    const pet = await this.petsService.getPetById(userId, petId);
    await this.checkRateLimit(userId);

    const verdict = moderateInput(message);
    if (verdict) {
      this.logger.warn(`Mensaje moderado (${verdict.reason}) en la mascota ${pet.id} (modo local)`);
      return { moderated: verdict };
    }

    const { messages } = await this.buildContext(userId, pet, message, 'memory');

    const now = Date.now();
    for (const [id, t] of this.localTurns) if (t.expiresAt < now) this.localTurns.delete(id);
    if (this.localTurns.size >= LOCAL_MAX_TICKETS) {
      throw new HttpException('Demasiados turnos pendientes, inténtalo de nuevo en un momento', HttpStatus.TOO_MANY_REQUESTS);
    }
    const turnId = randomUUID();
    this.localTurns.set(turnId, { userId, petId, message, expiresAt: now + LOCAL_TURN_TTL_MS });
    return { turnId, messages, maxTokens: 300, expiresInSeconds: LOCAL_TURN_TTL_MS / 1000 };
  }

  /** Paso 2: el cliente entrega la respuesta; se modera, se guarda y sube la inteligencia. */
  async syncLocal(userId: string, petId: string, turnId: unknown, rawReply: unknown) {
    const ticket = typeof turnId === 'string' ? this.localTurns.get(turnId) : undefined;
    if (!ticket || ticket.userId !== userId || ticket.petId !== petId || ticket.expiresAt < Date.now()) {
      throw new BadRequestException('Turno no válido o caducado');
    }
    this.localTurns.delete(turnId as string); // un solo uso

    if (typeof rawReply !== 'string') throw new BadRequestException('reply es obligatorio');
    const reply = rawReply.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, LOCAL_MAX_REPLY_CHARS);
    if (!reply) throw new BadRequestException('La respuesta está vacía');

    const verdict = moderateOutput(reply);
    if (verdict) {
      this.logger.warn(`Respuesta local bloqueada (${verdict.reason}); no se guarda`);
      return { moderated: verdict };
    }

    const pet = await this.petsService.getPetById(userId, petId);
    const saved = await this.persistExchange(userId, pet, ticket.message, reply, 0);
    return { message: { id: saved.id, content: reply }, intelligence: saved.intelligence, tier: intelligenceTier(saved.intelligence) };
  }

  /** Guarda el intercambio, sube la inteligencia y avisa por WebSocket. */
  private async persistExchange(userId: string, pet: any, userMessage: string, reply: string, tokens: number) {
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
    return { id: saved.id, intelligence };
  }

  private async *moderatedOnly(v: ModerationVerdict): AsyncGenerator<ChatStreamEvent> {
    yield { type: 'moderated', reason: v.reason, message: v.message, hideUserMessage: v.hideUserMessage };
  }

  private async *run(
    userId: string,
    pet: any,
    userMessage: string,
    messages: ChatMessageInput[],
    provider: LlmProvider,
    model: string,
    mode: string,
    signal?: AbortSignal,
    agentCtx?: AgentContext,
  ): AsyncGenerator<ChatStreamEvent> {
    if (this.active.has(userId)) {
      yield { type: 'error', message: 'Ya hay una respuesta en curso; espera a que termine' };
      return;
    }
    this.active.add(userId);

    const guard = new OutputGuard();
    let tokens = 0;
    let proposed = 0;
    const convo = [...messages];
    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        // En la última vuelta no se ofrecen herramientas para forzar una respuesta de texto
        const tools =
          agentCtx && round < MAX_TOOL_ROUNDS - 1 ? toolDefinitions(agentCtx.clientTools) : undefined;
        let text = '';
        const calls: ToolCall[] = [];
        for await (const ev of provider.chat(convo, { model, maxTokens: 300, tools, signal })) {
          if (ev.type === 'delta') {
            text += ev.text;
            // Moderación de salida en streaming: se retiene el final hasta confirmar que es seguro
            const safe = guard.push(ev.text);
            if (safe === null) return yield* this.blockedOutput(guard);
            if (safe) yield { type: 'delta', text: safe };
          } else if (ev.type === 'tool_call') {
            calls.push({ id: ev.id, name: ev.name, arguments: ev.arguments });
          } else if (ev.type === 'done') {
            tokens += (ev.usage?.promptTokens ?? 0) + (ev.usage?.completionTokens ?? 0);
          }
        }
        if (calls.length === 0 || !agentCtx) break;

        convo.push({ role: 'assistant', content: text, toolCalls: calls });
        for (const call of calls) {
          const outcome = await this.agent.handle({ ...agentCtx, now: new Date() }, call);
          if (outcome.kind === 'confirm') {
            proposed++;
            yield { type: 'action', action: outcome.action };
          } else {
            yield { type: 'tool', name: call.name };
          }
          convo.push({ role: 'tool', toolCallId: call.id, content: outcome.content });
        }
      }

      const rest = guard.flush();
      if (rest === null) return yield* this.blockedOutput(guard);
      if (rest) yield { type: 'delta', text: rest };

      let reply = guard.full;
      // Si solo se propusieron acciones y el modelo no dijo nada, se avisa al usuario
      if (!reply.trim() && proposed > 0) {
        reply = 'Necesito tu confirmación para seguir. 👆';
        yield { type: 'delta', text: reply };
      }
      if (!reply.trim()) {
        yield { type: 'error', message: 'El proveedor no devolvió ninguna respuesta' };
        return;
      }

      // Solo se persiste el intercambio si se completó
      const saved = await this.persistExchange(userId, pet, userMessage, reply, tokens);
      const intelligence = saved.intelligence;

      // En segundo plano: no retrasa la respuesta ni puede romper el chat
      void this.memory.maybeSummarize(pet.id, intelligence, provider, model, userId, mode);

      yield {
        type: 'done',
        message: { id: saved.id, content: reply },
        intelligence,
        tier: intelligenceTier(intelligence),
      };
    } catch (err: any) {
      if (signal?.aborted) return; // el cliente cerró la conexión
      this.logger.warn(`Fallo del proveedor de IA: ${err?.message}`);
      yield { type: 'error', message: err?.message || 'Error del proveedor de IA' };
    } finally {
      this.active.delete(userId);
      // Cuota: se contabiliza lo consumido aunque la respuesta se bloquee o falle a medias
      const used = tokens > 0 ? tokens : this.estimateTokens(messages, guard.full);
      await this.usage.record(userId, used).catch((e) => this.logger.warn(`No se pudo registrar el uso: ${e?.message}`));
    }
  }

  private async *blockedOutput(guard: OutputGuard): AsyncGenerator<ChatStreamEvent> {
    const v = guard.verdict!;
    this.logger.warn(`Respuesta del modelo bloqueada (${v.reason}); no se muestra ni se guarda`);
    yield { type: 'moderated', reason: v.reason, message: v.message, hideUserMessage: false };
  }

  /** Estimación (~4 caracteres por token) cuando el proveedor no informa del uso. */
  private estimateTokens(messages: ChatMessageInput[], reply: string): number {
    const chars = messages.reduce((n, m) => n + m.content.length, 0) + reply.length;
    return Math.ceil(chars / 4);
  }
}
