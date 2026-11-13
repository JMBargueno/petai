import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AiConfigService, AiConfigInput } from './ai-config.service';
import { ChatService } from './chat.service';
import { MemoryService } from './memory.service';

@ApiTags('AI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class AiController {
  constructor(
    private readonly aiConfig: AiConfigService,
    private readonly chat: ChatService,
    private readonly memory: MemoryService,
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

  @Post('pets/:id/chat')
  @ApiOperation({ summary: 'Conversar con la mascota (streaming SSE: eventos delta, done, error)' })
  async chatStream(
    @CurrentUser() user: any,
    @Param('id') petId: string,
    @Body() body: { message?: string } | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const abort = new AbortController();
    res.on('close', () => abort.abort());

    // Las validaciones lanzan excepciones HTTP normales antes de abrir el flujo
    const { events } = await this.chat.prepare(user.id, petId, body?.message, abort.signal);

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
