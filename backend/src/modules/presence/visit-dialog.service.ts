import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { ExclusiveLockService } from '../../redis/exclusive-lock.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { MindService } from '../mind/mind.service';
import { MindMemoryService } from '../mind/mind-memory.service';
import { dayKey } from '../mind/evolution.engine';
import { isShareable } from '../mind/social.engine';
import { VisitorCtx, VisitorEffect, VisitorReply, VisitorState, openVisit, stepVisit } from '../mind/visitor.engine';

/** Lo que dura guardada una conversación: algo más que la visita más larga (15 min). */
const STATE_TTL_S = 20 * 60;
const DAY_TTL_S = 36 * 60 * 60;

export interface VisitInteraction extends VisitorReply {
  /** Lo que el Pockai siente por quien le visita, en una etapa (desconocido, conocido, amigo…). */
  stage: string;
  petName: string;
}

const clamp = (v: number) => Math.min(100, Math.max(0, v));

/**
 * Un entrenador de visita habla con el Pockai anfitrión (spec 37 §6.2): por menú, sin texto libre
 * y sin LLM. Aquí solo se traen los datos, se guarda el estado de la conversación y se aplican los
 * efectos; qué se ofrece y qué contesta lo decide `mind/visitor.engine.ts`.
 *
 * - Solo con una visita en vivo activa entre ambos (403 si no).
 * - El estado vive en Redis (con respaldo en memoria si Redis no responde) y se borra al acabar
 *   la visita.
 * - Privacidad: de la memoria del anfitrión solo se lee su relación con el visitante y, para
 *   «¿qué tal estás?», una vivencia propia de la lista blanca de los rumores. Nunca la capa
 *   semántica ni nada de su entrenador.
 */
@Injectable()
export class VisitDialogService {
  private readonly logger = new Logger(VisitDialogService.name);
  private readonly localState = new Map<string, VisitorState>();
  private readonly localDaily = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly locks: ExclusiveLockService,
    @Optional() private readonly realtime?: RealtimeGateway,
    /**
     * La mente se resuelve en tiempo de ejecución: importar MindModule aquí cerraría un ciclo
     * (Mind → Billing → Realtime → Presence → Mind).
     */
    @Optional() private readonly moduleRef?: ModuleRef,
    @Optional() mind?: MindService,
    @Optional() memory?: MindMemoryService,
  ) {
    this.mindRef = mind ?? null;
    this.memoryRef = memory ?? null;
  }

  private mindRef: MindService | null;
  private memoryRef: MindMemoryService | null;

  private get mind(): MindService {
    this.mindRef ??= this.resolve(MindService);
    return this.mindRef;
  }

  private get memory(): MindMemoryService {
    this.memoryRef ??= this.resolve(MindMemoryService);
    return this.memoryRef;
  }

  private resolve<T>(type: new (...args: any[]) => T): T {
    try {
      const found = this.moduleRef?.get(type, { strict: false });
      if (found) return found;
    } catch {
      /* se informa abajo */
    }
    throw new ServiceUnavailableException('El menú de visita no está disponible ahora mismo');
  }

  async interact(actorId: string, body: { ownerId?: string; choice?: number; turn?: number } = {}, now = new Date()): Promise<VisitInteraction> {
    const visit = await this.prisma.habitatVisit.findFirst({
      where: { visitorId: actorId, status: 'active', ...(body.ownerId ? { ownerId: body.ownerId } : {}) },
      orderBy: { startedAt: 'desc' },
    });
    if (!visit) throw new ForbiddenException('No tienes ninguna visita en curso con este amigo');
    if (body.choice !== undefined && !(Number.isInteger(body.choice) && body.choice >= 0)) throw new BadRequestException('choice debe ser el índice de una opción');
    // Una interacción a la vez por visita: dos peticiones simultáneas no gastan dos premios
    return this.locks.runExclusive('visit-dialog', visit.id, () => this.step(visit, actorId, body, now), 15_000);
  }

  private async step(
    visit: { id: string; ownerId: string },
    actorId: string,
    body: { choice?: number; turn?: number },
    now: Date,
  ): Promise<VisitInteraction> {
    const host = await this.hostPet(visit.ownerId);
    if (!host) throw new NotFoundException('Tu amigo no tiene ningún Pockai en casa');
    const cfg = this.mind.config();
    if (!cfg.social?.visitor) throw new BadRequestException('El menú de visita no está disponible');
    const subject = `user:${actorId}`;
    const dailyKey = `visitfx:${host.id}:${actorId}:${dayKey(now)}`;
    const [{ dims }, stage, visitor, treat, story, usedToday] = await Promise.all([
      this.mind.ensureDims(host),
      this.memory.stageWith(host.id, subject),
      this.prisma.user.findUnique({ where: { id: actorId }, select: { displayName: true } }),
      this.treatOf(actorId),
      this.storyOf(host.id, now),
      this.dailyCount(dailyKey),
    ]);
    const visitorName = visitor?.displayName || 'Un amigo de mi entrenador';
    const ctx: VisitorCtx = {
      petId: host.id,
      petName: host.nickname || 'El Pockai',
      visitorName,
      dims,
      stage,
      sleeping: !!host.sleeping,
      sick: !!host.sick,
      energy: host.energy ?? 60,
      happiness: host.happiness ?? 60,
      hunger: host.hunger ?? 60,
      treat,
      story,
      canEffect: usedToday < cfg.social.visitor.dailyEffects,
    };
    const out = (reply: VisitorReply): VisitInteraction => ({ ...reply, stage, petName: ctx.petName });

    const prev = await this.loadState(visit.id);
    if (body.choice === undefined) {
      // Sin elección: empieza la conversación, o la retoma donde estaba si ya había empezado
      if (prev?.last && !prev.ended) return out(prev.last);
      const opened = openVisit(ctx, cfg);
      await this.saveState(visit.id, opened.state);
      return out(opened.reply);
    }
    if (!prev?.last) throw new BadRequestException('Empieza la conversación antes de elegir');
    // Petición repetida (reintento de red, doble clic): se devuelve lo ya contestado, sin efecto
    if (body.turn !== undefined && body.turn !== prev.turn) return out(prev.last);
    const chosen = prev.last.options[body.choice];
    if (!chosen) throw new BadRequestException('Esa opción no está en el menú');
    const next = stepVisit(prev, chosen.id, ctx, cfg);
    if (!next) throw new BadRequestException('Esa opción ya no está disponible');

    // El premio sale del inventario del visitante, una sola vez: si ya no lo tiene, no hay turno
    if (next.effect?.consume) {
      const spent = await this.prisma.inventoryItem.updateMany({
        where: { userId: actorId, itemId: next.effect.consume.id, qty: { gte: 1 } },
        data: { qty: { decrement: 1 } },
      });
      if (spent.count !== 1) throw new BadRequestException('Ya no te queda ese alimento');
    }
    await this.saveState(visit.id, next.state);
    if (next.effect) {
      await this.bumpDaily(dailyKey);
      await this.apply(host, visit, actorId, visitorName, next.effect);
    }
    // El dueño lo ve en directo; si no está, queda el recuerdo y su Pockai se lo contará
    this.realtime?.emitToUser(visit.ownerId, 'habitat:visitor_interaction', {
      visitorId: actorId,
      petId: host.id,
      option: chosen.id,
      line: next.reply.line,
      behavior: next.reply.behavior,
    });
    return out(next.reply);
  }

  /** Efectos en el anfitrión. La mente nunca rompe la respuesta al visitante. */
  private async apply(host: any, visit: { id: string }, actorId: string, visitorName: string, effect: VisitorEffect) {
    try {
      if (effect.happiness || effect.hunger) {
        await this.prisma.pet.update({
          where: { id: host.id },
          data: { happiness: clamp((host.happiness ?? 0) + effect.happiness), hunger: clamp((host.hunger ?? 0) + effect.hunger) },
        });
      }
      await this.mind.applyExperience(host.id, [effect.event]);
      await this.memory.feel(host.id, `user:${actorId}`, `${visitorName} (otro entrenador)`, effect.delta);
      // Un solo recuerdo por visita, que se va completando (misma clave)
      await this.memory.remember(host.id, [
        { layer: 'episodic', kind: 'visit', key: `visitor:${visit.id}`, content: effect.episode, importance: 0.55, valence: 0.5, subject: `user:${actorId}` },
      ]);
    } catch (e: any) {
      this.logger.warn(`Efecto de visita no aplicado (${host.id}): ${e?.message}`);
    }
  }

  @OnEvent('habitat:visit_ended')
  onVisitEnded(p: { visitId?: string }) {
    if (!p?.visitId) return;
    this.localState.delete(p.visitId);
    void this.redis.run((c) => c.del(this.redis.key(`visit-dialog:${p.visitId}`)), 'visit.dialog.del');
  }

  // ── Datos ────────────────────────────────────────────────────────────────

  /** El Pockai que recibe: el que su entrenador tiene elegido o, si no, el más antiguo. */
  private async hostPet(ownerId: string): Promise<any | null> {
    const user = await this.prisma.user.findUnique({ where: { id: ownerId }, select: { activePetId: true } });
    const chosen = user?.activePetId ? await this.prisma.pet.findFirst({ where: { id: user.activePetId, userId: ownerId } }) : null;
    return chosen ?? (await this.prisma.pet.findFirst({ where: { userId: ownerId }, orderBy: { createdAt: 'asc' } }));
  }

  /** Alimento que el visitante ofrecería: del que más tiene. */
  private async treatOf(userId: string): Promise<{ id: string; name: string } | null> {
    const row = await this.prisma.inventoryItem.findFirst({
      where: { userId, qty: { gte: 1 }, item: { kind: 'food' } },
      orderBy: [{ qty: 'desc' }, { itemId: 'asc' }],
      include: { item: { select: { id: true, name: true } } },
    });
    return row?.item ? { id: row.item.id, name: row.item.name } : null;
  }

  /** Una vivencia propia que puede contar a alguien de fuera (misma lista blanca que los rumores). */
  private async storyOf(petId: string, now: Date): Promise<string | null> {
    const rumors = this.mind.config().social?.rumors;
    if (!rumors) return null;
    const since = new Date(now.getTime() - rumors.maxAgeDays * 86_400_000);
    const rows = await this.memory.shareableEpisodes(petId, rumors.kinds, since).catch(() => []);
    return rows.find((m) => isShareable(m, rumors, now))?.content ?? null;
  }

  // ── Estado ───────────────────────────────────────────────────────────────

  private async loadState(visitId: string): Promise<VisitorState | null> {
    const raw = await this.redis.run((c) => c.get(this.redis.key(`visit-dialog:${visitId}`)), 'visit.dialog.get');
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw) as VisitorState;
      } catch {
        /* estado corrupto: se usa el respaldo */
      }
    }
    return this.localState.get(visitId) ?? null;
  }

  private async saveState(visitId: string, state: VisitorState) {
    this.localState.set(visitId, state);
    await this.redis.run((c) => c.set(this.redis.key(`visit-dialog:${visitId}`), JSON.stringify(state), 'EX', STATE_TTL_S), 'visit.dialog.set');
  }

  private async dailyCount(key: string): Promise<number> {
    const raw = await this.redis.run((c) => c.get(this.redis.key(key)), 'visit.daily.get');
    const n = typeof raw === 'string' ? Number(raw) : NaN;
    return Math.max(Number.isFinite(n) ? n : 0, this.localDaily.get(key) ?? 0);
  }

  private async bumpDaily(key: string) {
    // El respaldo en memoria no crece sin fin: solo interesan las claves de hoy
    if (this.localDaily.size > 5000) this.localDaily.clear();
    this.localDaily.set(key, (this.localDaily.get(key) ?? 0) + 1);
    await this.redis.run(async (c) => {
      const n = await c.incr(this.redis.key(key));
      if (n === 1) await c.expire(this.redis.key(key), DAY_TTL_S);
      return n;
    }, 'visit.daily.incr');
  }
}
