import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { ExclusiveLockService } from '../../redis/exclusive-lock.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PetsService } from '../pets/pets.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AiConfigService } from './ai-config.service';
import { MemoryService } from './memory.service';
import { AgentContext, AgentService } from './agent.service';
import { UsageService } from './usage.service';
import { sanitizeClientTools, toolDefinitions } from './agent-tools';
import { sanitizeClientContext } from './client-context';
import { ChatMessageInput, LlmProvider, ToolCall } from './llm-provider';
import { ModerationVerdict, OutputGuard, moderateInput, moderateOutput } from './moderation';
import { randomUUID } from 'crypto';
import { safeTimeZone } from '../pets/sleep-cycle';
import { EnvironmentalService } from '../environmental/environmental.service';
import { BondingService } from '../bonding/bonding.service';
import { isBondingTierAtLeast } from '../bonding/bonding';
import { AGENT_UNLOCK, INTELLIGENCE_MAX, MEMORY_UNLOCK, buildSystemPrompt, intelligenceTier } from './personality';
import { EntitlementService } from '../billing/entitlement.service';
import { DailyQuotaService } from '../billing/daily-quota.service';
import { BillingConfigService } from '../billing/billing-config.service';
import { ManagedBudgetService } from '../billing/managed-budget.service';
import { PlanLimits } from '../billing/plans';

export type ChatStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'action'; action: { id: string; tool: string; summary: string; expiresAt: Date; clientSide: boolean } }
  | { type: 'moderated'; reason: string; message: string; hideUserMessage: boolean }
  | { type: 'done'; message: { id: string; content: string; thinking?: string }; intelligence: number; tier: string }
  | { type: 'error'; message: string };

export const MAX_MESSAGE_CHARS = 1000;
/** Razonamiento máximo que se devuelve al cliente (no se guarda en el historial). */
export const MAX_THINKING_CHARS = 8000;
const HISTORY_MESSAGES = 20;
const HISTORY_CHAR_BUDGET = 6000;
const RATE_LIMIT = { max: 20, windowMs: 60_000 };
/** Vueltas máximas de herramientas por mensaje (la última se fuerza sin herramientas). */
const MAX_TOOL_ROUNDS = 3;
/** Modo Hermes local: vigencia de un turno y tamaño máximo de la respuesta sincronizada. */
const LOCAL_TURN_TTL_MS = 5 * 60 * 1000;
const LOCAL_MAX_TICKETS = 200;
const LOCAL_MAX_REPLY_CHARS = 4000;
/** TTL del guard "una respuesta en curso por usuario" (R-02): cubre respuestas de varios turns de
 * herramientas sin atrapar el guard si el stream se abandona. */
const INFLIGHT_LOCK_TTL_MS = 5 * 60 * 1000;
/** Margen (caracteres) para prompt de sistema, recuerdos y contexto al estimar el coste de una llamada. */
const PROMPT_OVERHEAD_CHARS = 8000;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  // Ventana deslizante: Redis (compartida entre instancias) con respaldo en memoria por instancia.
  private readonly hits = new Map<string, number[]>();
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
    private readonly bonding: BondingService,
    private readonly exclusiveLock: ExclusiveLockService,
    private readonly entitlements: EntitlementService,
    private readonly dailyQuota: DailyQuotaService,
    private readonly billingConfig: BillingConfigService,
    private readonly managedBudget: ManagedBudgetService,
    @Optional() private readonly redis?: RedisService,
    @Optional() private readonly environmental?: EnvironmentalService,
  ) {}

  private async checkRateLimit(userId: string) {
    const tooMany = () => new HttpException('Demasiados mensajes seguidos, espera un momento', HttpStatus.TOO_MANY_REQUESTS);
    const now = Date.now();
    // Límite por minuto configurable desde el panel (`byok.rateLimitPerMinute`); en managed además
    // aplican la cuota diaria y el presupuesto global.
    const max = this.billingConfig.byokSettings()?.rateLimitPerMinute ?? RATE_LIMIT.max;
    if (this.redis) {
      const blocked = await this.redis.run(async (r) => {
        const k = this.redis!.key(`chatrate:${userId}`);
        await r.zremrangebyscore(k, 0, now - RATE_LIMIT.windowMs);
        if ((await r.zcard(k)) >= max) return true;
        await r.multi().zadd(k, now, `${now}-${Math.random().toString(36).slice(2, 8)}`).pexpire(k, RATE_LIMIT.windowMs).exec();
        return false;
      });
      if (blocked === true) throw tooMany();
      if (blocked === false) return;
    }
    const recent = (this.hits.get(userId) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
    if (recent.length >= max) throw tooMany();
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
    rawClientContext?: unknown,
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

    let limits: PlanLimits | undefined;
    let quotaKey: string | undefined;
    let reservedMicro = 0;

    if (mode === 'managed') {
      const plan = await this.entitlements.planFor(userId);
      limits = await this.billingConfig.limits(plan);
      if (message.length > limits.maxInputChars) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'message_too_long',
          max: limits.maxInputChars,
          message: `El mensaje supera los ${limits.maxInputChars} caracteres`,
        });
      }
      await this.managedBudget.assertOpen(plan);
      const quota = await this.dailyQuota.consume(userId, plan);
      quotaKey = quota.key;
      try {
        // Reserva atómica del coste máximo esperado de esta llamada (se ajusta al real al terminar)
        const promptEstimate = Math.ceil((limits.historyCharBudget + limits.maxInputChars + PROMPT_OVERHEAD_CHARS) / 4);
        reservedMicro = await this.managedBudget.reserve(
          plan,
          this.managedBudget.estimateCostUsd(promptEstimate, limits.maxOutputTokens),
        );
      } catch (err) {
        await this.dailyQuota.refund(quotaKey).catch(() => undefined);
        throw err;
      }
    }

    let messages: ChatMessageInput[];
    let timeZone: string;
    let now: Date;
    const clientTools = sanitizeClientTools(rawClientTools);
    try {
      await this.usage.assertWithinQuota(userId, mode);
      ({ messages, timeZone, now } = await this.buildContext(userId, pet, message, 'agent', {
        clientTools,
        clientContext: sanitizeClientContext(rawClientContext, pet),
        limits,
      }));
    } catch (err) {
      // No llegó a llamarse al proveedor: se devuelve el mensaje del día y la reserva
      await this.releaseManaged(quotaKey, reservedMicro);
      throw err;
    }

    // Agente (intelligence ≥ 500 y habilitado por el plan): puede usar herramientas
    const allowsAgent = limits?.agentTools ?? true;
    const agentCtx: AgentContext | undefined =
      allowsAgent && (pet.intelligence ?? 0) >= AGENT_UNLOCK
        ? { userId, petId: pet.id, timeZone, now, clientTools }
        : undefined;

    return {
      events: this.run(userId, pet, message, messages, provider, model, mode, signal, agentCtx, limits, quotaKey, reservedMicro),
    };
  }

  /** Devuelve el mensaje diario y la reserva de presupuesto de una petición gestionada que no llegó al proveedor. */
  private async releaseManaged(quotaKey: string | undefined, reservedMicro: number) {
    if (quotaKey) await this.dailyQuota.refund(quotaKey).catch(() => undefined);
    if (reservedMicro > 0) await this.managedBudget.settle(reservedMicro, 0).catch(() => undefined);
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
    extra: {
      clientTools?: string[];
      clientContext?: ReturnType<typeof sanitizeClientContext>;
      limits?: PlanLimits;
    } = {},
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

    const historyTake = extra.limits ? extra.limits.historyMessages : HISTORY_MESSAGES;
    const historyBudget = extra.limits ? extra.limits.historyCharBudget : HISTORY_CHAR_BUDGET;

    const past = await this.prisma.chatMessage.findMany({
      where: { petId: pet.id, role: { in: ['user', 'assistant'] } },
      orderBy: { createdAt: 'desc' },
      take: historyTake,
    });
    const history: ChatMessageInput[] = [];
    let budget = historyBudget;
    for (const m of past) {
      budget -= m.content.length;
      if (budget < 0) break;
      history.unshift({ role: m.role as 'user' | 'assistant', content: m.content });
    }

    // Contexto ambiental (feature 005): hora del día, clima y festividad del usuario.
    // Es opcional y tolerante a fallos: si no se obtiene, el prompt simplemente no lleva el bloque.
    let environment: {
      timeOfDay?: string;
      weatherCondition?: string;
      temperature?: number | null;
      festival?: { name: string; message: string } | null;
    } | null = null;
    if (this.environmental) {
      try {
        const env = await this.environmental.getStatus(userId);
        environment = {
          timeOfDay: env.timeOfDay,
          weatherCondition: env.weather.condition,
          temperature: env.weather.temperature,
          festival: env.festival ? { name: env.festival.name, message: env.festival.message } : null,
        };
      } catch (e) {
        this.logger.debug(`No se pudo obtener el contexto ambiental: ${(e as Error).message}`);
      }
    }

    // Memoria (feature 006): recuerdos relevantes en el prompt de sistema cuando el
    // `intelligence` lo desbloquea (≥ MEMORY_UNLOCK) O el vínculo alcanza `ally` (60+).
    // Es idempotente: un solo bloque aunque ambas condiciones se cumplan.
    let systemPrompt = buildSystemPrompt(pet, owner ?? {}, {
      tier,
      now,
      timeZone,
      environment,
      bondingTier: pet.bondingTier,
      clientContext: extra.clientContext,
      clientTools: extra.clientTools,
    });
    if ((pet.intelligence ?? 0) >= MEMORY_UNLOCK || isBondingTierAtLeast(pet.bondingTier, 'ally')) {
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
  async prepareLocal(userId: string, petId: string, rawMessage: unknown, rawClientContext?: unknown) {
    const message = this.sanitizeInput(rawMessage);
    const pet = await this.petsService.getPetById(userId, petId);
    await this.checkRateLimit(userId);

    const verdict = moderateInput(message);
    if (verdict) {
      this.logger.warn(`Mensaje moderado (${verdict.reason}) en la mascota ${pet.id} (modo local)`);
      return { moderated: verdict };
    }

    const { messages } = await this.buildContext(userId, pet, message, 'memory', {
      clientContext: sanitizeClientContext(rawClientContext, pet),
    });

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
    // Vínculo (feature 006): cada turno de chat completado sube el bonding (+1). El intercambio
    // ya está persistido: si el registro de vínculo falla, no rompe la respuesta del chat.
    await this.bonding
      .recordInteraction(pet.id, userId, 'chat')
      .catch((e) => this.logger.warn(`No se pudo registrar el bonding del chat: ${e?.message}`));
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
    limits?: PlanLimits,
    quotaKey?: string,
    reservedMicro = 0,
  ): AsyncGenerator<ChatStreamEvent> {
    const managed = mode === 'managed';
    // Una respuesta en curso por usuario (guard distribuido, R-02): evita ráfagas paralelas que
    // disparan el gasto de LLM, respetado entre réplicas vía Redis (fallback en memoria).
    const inflightLock = await this.exclusiveLock.acquire('chat', userId, INFLIGHT_LOCK_TTL_MS);
    if (!inflightLock.ok) {
      // Rechazado antes de llamar al proveedor: no debe gastar el mensaje del día ni presupuesto
      await this.releaseManaged(quotaKey, reservedMicro);
      yield { type: 'error', message: 'Ya hay una respuesta en curso; espera a que termine' };
      return;
    }

    // Semáforo global de streams gestionados (`managedAi.maxConcurrency`)
    let slot: string | undefined;
    if (managed) {
      try {
        slot = await this.managedBudget.acquireSlot();
      } catch (err: any) {
        await this.exclusiveLock.release('chat', userId, inflightLock.token);
        await this.releaseManaged(quotaKey, reservedMicro);
        yield { type: 'error', message: err?.response?.message || 'La IA de Pockai está ocupada; reintenta en unos segundos' };
        return;
      }
    }

    const guard = new OutputGuard();
    let tokens = 0;
    let proposed = 0;
    // Razonamiento del modelo: va aparte de la respuesta, no se emite en streaming ni se guarda
    let thinking = '';
    let hasEmittedDelta = false;
    // Coste real (OpenRouter `usage.cost`) o, si una vuelta no lo informa, estimación conservadora
    let costUsd = 0;
    let costReported = false;
    const convo = [...messages];
    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        // En la última vuelta no se ofrecen herramientas para forzar una respuesta de texto
        const tools =
          agentCtx && round < MAX_TOOL_ROUNDS - 1 ? toolDefinitions(agentCtx.clientTools) : undefined;
        let text = '';
        const calls: ToolCall[] = [];
        const maxTokens = limits?.maxOutputTokens ?? 1200;
        for await (const ev of provider.chat(convo, { model, maxTokens, tools, signal })) {
          if (ev.type === 'delta') {
            text += ev.text;
            // Moderación de salida en streaming: se retiene el final hasta confirmar que es seguro
            const safe = guard.push(ev.text);
            if (safe === null) return yield* this.blockedOutput(guard);
            if (safe) {
              hasEmittedDelta = true;
              yield { type: 'delta', text: safe };
            }
          } else if (ev.type === 'thinking') {
            if (thinking.length < MAX_THINKING_CHARS) thinking += ev.text;
          } else if (ev.type === 'tool_call') {
            calls.push({ id: ev.id, name: ev.name, arguments: ev.arguments });
          } else if (ev.type === 'done') {
            const p = ev.usage?.promptTokens ?? 0;
            const c = ev.usage?.completionTokens ?? 0;
            if (managed) {
              if (typeof ev.usage?.costUsd === 'number') {
                costUsd += ev.usage.costUsd;
                costReported = true;
              } else if (p + c > 0) {
                costUsd += this.managedBudget.estimateCostUsd(p, c);
                costReported = true;
              }
            }
            tokens += p + c;
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
      if (rest) {
        hasEmittedDelta = true;
        yield { type: 'delta', text: rest };
      }

      let reply = guard.full;
      // Si solo se propusieron acciones y el modelo no dijo nada, se avisa al usuario
      if (!reply.trim() && proposed > 0) {
        reply = 'Necesito tu confirmación para seguir. 👆';
        hasEmittedDelta = true;
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
        message: { id: saved.id, content: reply, ...this.visibleThinking(thinking) },
        intelligence,
        tier: intelligenceTier(intelligence),
      };
    } catch (err: any) {
      if (signal?.aborted) return; // el cliente cerró la conexión
      if (!hasEmittedDelta && quotaKey) {
        await this.dailyQuota.refund(quotaKey).catch(() => undefined);
        await this.managedBudget.recordFailure().catch(() => undefined);
      }
      this.logger.warn(`Fallo del proveedor de IA: ${err?.message}`);
      yield { type: 'error', message: err?.message || 'Error del proveedor de IA' };
    } finally {
      await this.exclusiveLock.release('chat', userId, inflightLock.token);
      // Cuota: se contabiliza lo consumido aunque la respuesta se bloquee o falle a medias
      const used = tokens > 0 ? tokens : this.estimateTokens(messages, guard.full);
      if (managed) {
        // Sin `usage` del proveedor (stream cortado, etc.) se cobra la estimación sobre lo enviado
        if (!costReported) {
          costUsd = this.managedBudget.estimateCostUsd(used, 0);
        }
        await this.managedBudget.settle(reservedMicro, costUsd).catch(() => undefined);
        if (slot) await this.managedBudget.releaseSlot(slot).catch(() => undefined);
        if (hasEmittedDelta) {
          await this.managedBudget.recordSuccess().catch(() => undefined);
        }
      }
      await this.usage
        .record(userId, used, costUsd, mode === 'managed' ? 'openrouter' : undefined)
        .catch((e) => this.logger.warn(`No se pudo registrar el uso: ${e?.message}`));
    }
  }

  /**
   * El razonamiento suele parafrasear el prompt de sistema: se modera completo y, si no es
   * seguro, se omite sin afectar a la respuesta.
   */
  private visibleThinking(raw: string): { thinking?: string } {
    const text = raw.trim().slice(0, MAX_THINKING_CHARS);
    if (!text) return {};
    const verdict = moderateOutput(text);
    if (verdict) {
      this.logger.warn(`Razonamiento del modelo omitido (${verdict.reason})`);
      return {};
    }
    return { thinking: text };
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
