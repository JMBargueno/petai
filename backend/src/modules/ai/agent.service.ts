import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PetsService } from '../pets/pets.service';
import { GameDataService } from '../game-data/game-data.service';
import { MemoryService } from './memory.service';
import { ToolCall } from './llm-provider';
import {
  MAX_PENDING_REMINDERS,
  TOOL_BY_NAME,
  parseToolArguments,
} from './agent-tools';
import { moodOf } from './personality';
import { safeTimeZone } from '../pets/sleep-cycle';

const ACTION_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING_ACTIONS = 5;
const MAX_RESULT_CHARS = 2000;

export interface AgentContext {
  userId: string;
  petId: string;
  timeZone: string;
  now: Date;
}

export type ToolOutcome =
  | { kind: 'result'; content: string }
  | { kind: 'confirm'; action: { id: string; tool: string; summary: string; expiresAt: Date }; content: string };

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly petsService: PetsService,
    private readonly gameData: GameDataService,
    private readonly memory: MemoryService,
  ) {}

  /**
   * Gestiona una llamada del modelo. Nunca lanza: los errores se devuelven al
   * modelo como resultado para que pueda explicarlos al entrenador.
   */
  async handle(ctx: AgentContext, call: ToolCall): Promise<ToolOutcome> {
    const spec = TOOL_BY_NAME.get(call.name);
    if (!spec) return { kind: 'result', content: this.json({ error: `Herramienta desconocida: ${call.name}` }) };

    const parsed = parseToolArguments(call.arguments);
    if (parsed === undefined) return { kind: 'result', content: this.json({ error: 'Los argumentos no son JSON válido' }) };
    const valid = spec.validate(parsed, ctx.now);
    if (valid.ok === false) return { kind: 'result', content: this.json({ error: valid.error }) };

    try {
      if (spec.requiresConfirmation) {
        return await this.propose(ctx, spec.name, valid.args, spec.describe!(valid.args, ctx.timeZone));
      }
      return { kind: 'result', content: this.json(await this.execute(ctx, spec.name, valid.args)) };
    } catch (err: any) {
      this.logger.warn(`Fallo en la herramienta ${spec.name}: ${err?.message}`);
      return { kind: 'result', content: this.json({ error: err?.message || 'Error al ejecutar la herramienta' }) };
    }
  }

  private json(value: unknown): string {
    const text = JSON.stringify(value);
    return text.length > MAX_RESULT_CHARS ? text.slice(0, MAX_RESULT_CHARS) : text;
  }

  private async propose(ctx: AgentContext, tool: string, args: unknown, summary: string): Promise<ToolOutcome> {
    const pending = await this.prisma.pendingAction.count({
      where: { userId: ctx.userId, status: 'pending', expiresAt: { gt: ctx.now } },
    });
    if (pending >= MAX_PENDING_ACTIONS) {
      return {
        kind: 'result',
        content: this.json({ error: 'Hay demasiadas acciones pendientes de confirmar. Pide al entrenador que las resuelva primero.' }),
      };
    }
    const action = await this.prisma.pendingAction.create({
      data: {
        userId: ctx.userId,
        petId: ctx.petId,
        tool,
        args: args as any,
        summary,
        expiresAt: new Date(ctx.now.getTime() + ACTION_TTL_MS),
      },
    });
    return {
      kind: 'confirm',
      action: { id: action.id, tool, summary, expiresAt: action.expiresAt },
      content: this.json({ status: 'pendiente_de_confirmacion', note: 'La acción NO se ha ejecutado. Se ha enviado una tarjeta al entrenador para que la confirme.' }),
    };
  }

  /** Ejecuta una herramienta ya validada. Las de lectura se llaman directamente; las de efectos, tras confirmar. */
  private async execute(ctx: AgentContext, tool: string, args: any): Promise<unknown> {
    switch (tool) {
      case 'get_my_status': {
        const pet = await this.petsService.getPetById(ctx.userId, ctx.petId);
        return {
          nombre: pet.nickname,
          especie: pet.species?.name,
          nivel: pet.level,
          etapa: pet.stage,
          hambre: Math.round(pet.hunger),
          felicidad: Math.round(pet.happiness),
          energia: Math.round(pet.energy),
          higiene: Math.round(pet.hygiene),
          salud: Math.round(pet.health),
          enfermo: pet.sick,
          durmiendo: pet.sleeping,
          animo: moodOf(pet),
        };
      }
      case 'request_food': {
        const pet = await this.petsService.getPetById(ctx.userId, ctx.petId);
        const inv = await this.prisma.inventoryItem.findMany({
          where: { userId: ctx.userId, qty: { gt: 0 }, item: { kind: 'food' } },
          include: { item: true },
        });
        const favorite = pet.species?.favoriteFood;
        return {
          hambre: Math.round(pet.hunger),
          necesita_comer: pet.hunger < 50,
          comida_favorita: favorite,
          tiene_la_favorita: inv.some((i) => i.itemId === favorite),
          inventario: inv.map((i) => ({ id: i.itemId, nombre: i.item.name, cantidad: i.qty })),
        };
      }
      case 'suggest_minigame': {
        const pet = await this.petsService.getPetById(ctx.userId, ctx.petId);
        const cfg = this.gameData.getBalance().minigames;
        if (pet.sleeping) return { recomendado: null, motivo: 'Estoy durmiendo' };
        if (pet.energy < cfg.minEnergy) return { recomendado: null, motivo: 'Estoy demasiado cansado para jugar' };
        const id = pet.happiness < 50 ? 'catch_food' : pet.energy > 70 ? 'reflex' : 'memory_match';
        return {
          recomendado: id,
          nombre: cfg.games[id].name,
          motivo: pet.happiness < 50 ? 'Estoy algo triste y jugar me animará' : pet.energy > 70 ? 'Tengo mucha energía' : 'Un juego tranquilo para no cansarme',
          coste_energia: cfg.energyCost,
        };
      }
      case 'search_memory':
        return { recuerdos: await this.memory.search(ctx.petId, args.query, 5) };
      case 'list_reminders': {
        const rows = await this.prisma.reminder.findMany({
          where: { userId: ctx.userId, delivered: false },
          orderBy: { dueAt: 'asc' },
          take: 20,
        });
        return { recordatorios: rows.map((r) => ({ id: r.id, texto: r.text, para: r.dueAt.toISOString() })) };
      }
      case 'create_reminder': {
        const count = await this.prisma.reminder.count({ where: { userId: ctx.userId, delivered: false } });
        if (count >= MAX_PENDING_REMINDERS) {
          throw new BadRequestException(`Ya tienes ${MAX_PENDING_REMINDERS} recordatorios pendientes`);
        }
        const r = await this.prisma.reminder.create({
          data: { userId: ctx.userId, petId: ctx.petId, text: args.text, dueAt: new Date(args.due_at) },
        });
        return { id: r.id, texto: r.text, para: r.dueAt.toISOString() };
      }
      default:
        throw new BadRequestException('Herramienta no soportada');
    }
  }

  // ---------- Confirmación por parte del usuario ----------

  async listPending(userId: string, petId: string) {
    const rows = await this.prisma.pendingAction.findMany({
      where: { userId, petId, status: 'pending', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((a) => ({ id: a.id, tool: a.tool, summary: a.summary, expiresAt: a.expiresAt }));
  }

  async confirm(userId: string, petId: string, actionId: string) {
    const now = new Date();
    // Transición atómica: solo una petición puede confirmar (y ejecutar) la acción
    const claimed = await this.prisma.pendingAction.updateMany({
      where: { id: actionId, userId, petId, status: 'pending', expiresAt: { gt: now } },
      data: { status: 'confirmed' },
    });
    if (claimed.count === 0) {
      throw new NotFoundException('La acción no existe, ya fue resuelta o ha caducado');
    }
    const action = await this.prisma.pendingAction.findUniqueOrThrow({ where: { id: actionId } });
    const spec = TOOL_BY_NAME.get(action.tool);

    // Se revalidan los argumentos guardados antes de ejecutar
    const valid = spec?.validate(action.args, now);
    if (!spec || !valid || !valid.ok) {
      await this.prisma.pendingAction.update({ where: { id: actionId }, data: { status: 'rejected' } });
      throw new BadRequestException('La acción ya no es válida');
    }
    const owner = await this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    try {
      const result = await this.execute(
        { userId, petId, timeZone: safeTimeZone(owner?.timezone), now },
        action.tool,
        valid.args,
      );
      return { ok: true, tool: action.tool, summary: action.summary, result };
    } catch (err: any) {
      await this.prisma.pendingAction.update({ where: { id: actionId }, data: { status: 'rejected' } });
      throw err instanceof BadRequestException ? err : new BadRequestException('No se pudo ejecutar la acción');
    }
  }

  async reject(userId: string, petId: string, actionId: string) {
    const res = await this.prisma.pendingAction.updateMany({
      where: { id: actionId, userId, petId, status: 'pending' },
      data: { status: 'rejected' },
    });
    if (res.count === 0) throw new NotFoundException('La acción no existe o ya fue resuelta');
    return { ok: true };
  }

  // ---------- Recordatorios (entrega) ----------

  listReminders(userId: string) {
    return this.prisma.reminder.findMany({
      where: { userId, delivered: false },
      orderBy: { dueAt: 'asc' },
      take: 50,
      select: { id: true, text: true, dueAt: true, petId: true },
    });
  }

  dueReminders(userId: string) {
    return this.prisma.reminder.findMany({
      where: { userId, delivered: false, dueAt: { lte: new Date() } },
      orderBy: { dueAt: 'asc' },
      take: 20,
      select: { id: true, text: true, dueAt: true, petId: true },
    });
  }

  async markDelivered(userId: string, reminderId: string) {
    const res = await this.prisma.reminder.updateMany({
      where: { id: reminderId, userId, delivered: false },
      data: { delivered: true },
    });
    if (res.count === 0) throw new NotFoundException('Recordatorio no encontrado');
    return { ok: true };
  }

  async deleteReminder(userId: string, reminderId: string) {
    const res = await this.prisma.reminder.deleteMany({ where: { id: reminderId, userId } });
    if (res.count === 0) throw new NotFoundException('Recordatorio no encontrado');
    return { ok: true };
  }
}
