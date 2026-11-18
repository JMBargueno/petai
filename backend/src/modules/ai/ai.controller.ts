import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiBody } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AiConfigService, AiConfigInput } from './ai-config.service';
import { ChatService } from './chat.service';
import { MemoryService } from './memory.service';
import { AgentService } from './agent.service';
import { UsageService } from './usage.service';
import { APP_CATEGORIES } from './client-context';
import { EntitlementService } from '../billing/entitlement.service';
import { DailyQuotaService } from '../billing/daily-quota.service';

/** Contexto en vivo del escritorio (opcional). Solo listas cerradas: nunca títulos de ventana. */
const CLIENT_CONTEXT_SCHEMA: SchemaObject = {
  type: 'object',
  description: 'Contexto del escritorio (opcional); el servidor descarta lo que no permita la habilidad correspondiente',
  properties: {
    appCategory: { type: 'string', enum: [...APP_CATEGORIES] },
    pose: { type: 'string', enum: ['walking', 'climbing', 'perched', 'sleeping'] },
    pomodoro: {
      type: 'object',
      properties: {
        phase: { type: 'string', enum: ['idle', 'work', 'break'] },
        minutesLeft: { type: 'number' },
        sessionsToday: { type: 'number' },
      },
    },
  },
};

@ApiTags('AI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class AiController {
  constructor(
    private readonly aiConfig: AiConfigService,
    private readonly chat: ChatService,
    private readonly memory: MemoryService,
    private readonly agent: AgentService,
    private readonly usage: UsageService,
    private readonly entitlements: EntitlementService,
    private readonly dailyQuota: DailyQuotaService,
  ) {}

  @Get('ai/config')
  @ApiOperation({ summary: 'Configuración de IA (la API key se devuelve enmascarada)' })
  getConfig(@CurrentUser() user: any) {
    return this.aiConfig.getView(user.id);
  }

  @Put('ai/config')
  @ApiOperation({ summary: 'Configurar proveedor y API key BYOK (cifrada con AES-256-GCM)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        provider: { type: 'string', description: 'Proveedor de IA' },
        baseUrl: { type: 'string', description: 'URL base del endpoint' },
        model: { type: 'string', description: 'Modelo a usar' },
        apiKey: { type: 'string', description: 'API key BYOK (se cifra en el servidor)' },
      },
    },
  })
  putConfig(@CurrentUser() user: any, @Body() body: AiConfigInput | undefined) {
    return this.aiConfig.upsert(user.id, body);
  }

  @Delete('ai/config')
  @ApiOperation({ summary: 'Eliminar la configuración y la key almacenada' })
  deleteConfig(@CurrentUser() user: any) {
    return this.aiConfig.remove(user.id);
  }

  @Get('ai/usage')
  @ApiOperation({ summary: 'Consumo de tokens de IA del mes en curso y cuota' })
  async getUsage(@CurrentUser() user: any) {
    const cfg = await this.aiConfig.getView(user.id);
    const mode = cfg.configured ? (cfg as any).mode : 'managed';
    const plan = await this.entitlements.planFor(user.id);
    const baseSummary = await this.usage.summary(user.id, mode);
    const daily = await this.dailyQuota.peek(user.id, plan);
    return {
      ...baseSummary,
      plan,
      mode,
      daily,
    };
  }

  @Post('ai/config/test')
  @ApiOperation({ summary: 'Comprobar la validez de la key y la conectividad' })
  testConfig(@CurrentUser() user: any) {
    return this.aiConfig.test(user.id);
  }

  @Get('pets/:id/chat/history')
  @ApiOperation({ summary: 'Historial de conversación de la mascota' })
  history(@CurrentUser() user: any, @Param('id') petId: string, @Query('limit') limit?: string) {
    return this.chat.getHistory(user.id, petId, limit ? Number(limit) : undefined);
  }

  @Get('pets/:id/memories')
  @ApiOperation({ summary: 'Recuerdos de la mascota (hechos y resúmenes)' })
  memories(@CurrentUser() user: any, @Param('id') petId: string) {
    return this.memory.list(user.id, petId);
  }

  @Delete('pets/:id/memories/:memoryId')
  @ApiOperation({ summary: 'Olvidar un recuerdo concreto' })
  forget(@CurrentUser() user: any, @Param('id') petId: string, @Param('memoryId') memoryId: string) {
    return this.memory.remove(user.id, petId, memoryId);
  }

  @Delete('pets/:id/memories')
  @ApiOperation({ summary: 'Borrar toda la memoria de la mascota (también el perfil de hábitos)' })
  forgetAll(@CurrentUser() user: any, @Param('id') petId: string) {
    return this.memory.clear(user.id, petId);
  }

  @Post('pets/:id/context-digest')
  @ApiOperation({
    summary: 'Resumen diario del escritorio para los hábitos de la mascota (máx. 2 KB, uno cada 12 h)',
    description:
      'Solo categorías de app y minutos por franja de 4 h, y duraciones de Pomodoro. Nunca títulos de ventana. ' +
      'El servidor descarta las partes cuya habilidad (context_awareness, pomodoro_companion) no está activa.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        appMinutes: {
          type: 'object',
          description: 'Por categoría (coding, music, video, gaming, reading): 6 números (minutos por franja de 4 h)',
          additionalProperties: { type: 'array', items: { type: 'number' } },
        },
        pomodoros: { type: 'array', items: { type: 'number' }, description: 'Minutos de foco de cada Pomodoro completado' },
      },
    },
  })
  contextDigest(@CurrentUser() user: any, @Param('id') petId: string, @Body() body: unknown) {
    return this.memory.ingestDigest(user.id, petId, body);
  }

  // ---------- Acciones del agente (requieren confirmación del usuario) ----------

  @Get('pets/:id/actions')
  @ApiOperation({ summary: 'Acciones propuestas por la mascota pendientes de confirmar' })
  pendingActions(@CurrentUser() user: any, @Param('id') petId: string) {
    return this.agent.listPending(user.id, petId);
  }

  @Post('pets/:id/actions/:actionId/confirm')
  @ApiOperation({ summary: 'Confirmar y ejecutar una acción propuesta por la mascota' })
  confirmAction(@CurrentUser() user: any, @Param('id') petId: string, @Param('actionId') actionId: string) {
    return this.agent.confirm(user.id, petId, actionId);
  }

  @Post('pets/:id/actions/:actionId/reject')
  @ApiOperation({ summary: 'Rechazar una acción propuesta por la mascota' })
  rejectAction(@CurrentUser() user: any, @Param('id') petId: string, @Param('actionId') actionId: string) {
    return this.agent.reject(user.id, petId, actionId);
  }

  // ---------- Recordatorios ----------

  @Get('reminders')
  @ApiOperation({ summary: 'Recordatorios pendientes del usuario' })
  reminders(@CurrentUser() user: any) {
    return this.agent.listReminders(user.id);
  }

  @Get('reminders/due')
  @ApiOperation({ summary: 'Recordatorios vencidos aún no entregados' })
  dueReminders(@CurrentUser() user: any) {
    return this.agent.dueReminders(user.id);
  }

  @Post('reminders/:id/delivered')
  @ApiOperation({ summary: 'Marcar un recordatorio como entregado' })
  reminderDelivered(@CurrentUser() user: any, @Param('id') id: string) {
    return this.agent.markDelivered(user.id, id);
  }

  @Delete('reminders/:id')
  @ApiOperation({ summary: 'Eliminar un recordatorio' })
  deleteReminder(@CurrentUser() user: any, @Param('id') id: string) {
    return this.agent.deleteReminder(user.id, id);
  }

  // ---------- Modo Hermes local (la inferencia la hace el escritorio) ----------

  @Post('pets/:id/chat/local/context')
  @ApiOperation({ summary: 'Hermes local: valida el mensaje y devuelve los mensajes a enviar al modelo local' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Mensaje del usuario' },
        clientContext: CLIENT_CONTEXT_SCHEMA,
      },
    },
  })
  localContext(
    @CurrentUser() user: any,
    @Param('id') petId: string,
    @Body() body: { message?: string; clientContext?: unknown } | undefined,
  ) {
    return this.chat.prepareLocal(user.id, petId, body?.message, body?.clientContext);
  }

  @Post('pets/:id/chat/local/sync')
  @ApiOperation({ summary: 'Hermes local: entrega la respuesta generada en local para moderarla y guardarla' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        turnId: { type: 'string', description: 'ID del turno' },
        reply: { type: 'string', description: 'Respuesta generada en local' },
      },
    },
  })
  localSync(
    @CurrentUser() user: any,
    @Param('id') petId: string,
    @Body() body: { turnId?: string; reply?: string } | undefined,
  ) {
    return this.chat.syncLocal(user.id, petId, body?.turnId, body?.reply);
  }

  @Post('pets/:id/chat')
  @ApiOperation({
    summary: 'Conversar con la mascota (streaming SSE: eventos delta, tool, action, moderated, done, error)',
    description:
      'El razonamiento del modelo (reasoning_content o bloques <think>) nunca llega en los eventos delta: ' +
      'si existe y supera la moderación, el evento done lo incluye aparte en message.thinking (no se guarda en el historial).',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Mensaje del usuario' },
        clientTools: { type: 'array', items: { type: 'string' }, description: 'Herramientas del cliente (opcional)' },
        clientContext: CLIENT_CONTEXT_SCHEMA,
      },
    },
  })
  async chatStream(
    @CurrentUser() user: any,
    @Param('id') petId: string,
    @Body() body: { message?: string; clientTools?: string[]; clientContext?: unknown } | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const abort = new AbortController();
    res.on('close', () => abort.abort());

    // Las validaciones lanzan excepciones HTTP normales antes de abrir el flujo
    const { events } = await this.chat.prepare(
      user.id,
      petId,
      body?.message,
      abort.signal,
      body?.clientTools,
      body?.clientContext,
    );

    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    for await (const ev of events) {
      res.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`);
    }
    res.end();
  }
}
