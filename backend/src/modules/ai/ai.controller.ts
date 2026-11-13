import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AiConfigService, AiConfigInput } from './ai-config.service';
import { ChatService } from './chat.service';
import { MemoryService } from './memory.service';
import { AgentService } from './agent.service';
import { UsageService } from './usage.service';

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
  ) {}

  @Get('ai/config')
  @ApiOperation({ summary: 'Configuración de IA (la API key se devuelve enmascarada)' })
  getConfig(@CurrentUser() user: any) {
    return this.aiConfig.getView(user.id);
  }

  @Put('ai/config')
  @ApiOperation({ summary: 'Configurar proveedor y API key BYOK (cifrada con AES-256-GCM)' })
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
    return this.usage.summary(user.id, cfg.configured ? (cfg as any).mode : 'byok');
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
  @ApiOperation({ summary: 'Borrar toda la memoria de la mascota' })
  forgetAll(@CurrentUser() user: any, @Param('id') petId: string) {
    return this.memory.clear(user.id, petId);
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
  localContext(@CurrentUser() user: any, @Param('id') petId: string, @Body() body: { message?: string } | undefined) {
    return this.chat.prepareLocal(user.id, petId, body?.message);
  }

  @Post('pets/:id/chat/local/sync')
  @ApiOperation({ summary: 'Hermes local: entrega la respuesta generada en local para moderarla y guardarla' })
  localSync(
    @CurrentUser() user: any,
    @Param('id') petId: string,
    @Body() body: { turnId?: string; reply?: string } | undefined,
  ) {
    return this.chat.syncLocal(user.id, petId, body?.turnId, body?.reply);
  }

  @Post('pets/:id/chat')
  @ApiOperation({ summary: 'Conversar con la mascota (streaming SSE: eventos delta, done, error)' })
  async chatStream(
    @CurrentUser() user: any,
    @Param('id') petId: string,
    @Body() body: { message?: string; clientTools?: string[] } | undefined,
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
