import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { GiftingService } from './gifting.service';
import { CarePackageService } from './care-package.service';
import { GroupFeedingService } from './group-feeding.service';

@ApiTags('Gifting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class GiftingController {
  constructor(
    private readonly gifting: GiftingService,
    private readonly care: CarePackageService,
    private readonly groupFeeding: GroupFeedingService,
  ) {}

  @Post('gifting/send')
  @ApiOperation({ summary: 'Enviar un item del inventario al pet de un amigo' })
  @ApiResponse({ status: 201, description: 'Gift enviado (pendiente)' })
  @ApiResponse({ status: 400, description: 'Rate limit o inventario insuficiente' })
  @ApiResponse({ status: 404, description: 'Destinatario/item no encontrado' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  send(
    @CurrentUser() user: { id: string },
    @Body() body: { recipientUserId: string; petId: string; itemId: string; qty?: number; note?: string },
  ) {
    return this.gifting.send(user.id, body);
  }

  @Get('gifting/history')
  @ApiOperation({ summary: 'Historial de gifts (direction=sent|received)' })
  @ApiResponse({ status: 200, description: 'Lista de gifts (máx 50)' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  history(
    @CurrentUser() user: { id: string },
    @Query('direction') direction: 'sent' | 'received' = 'received',
    @Query('limit') limit = 50,
  ) {
    return this.gifting.history(user.id, direction === 'sent' ? 'sent' : 'received', Number(limit) || 50);
  }

  @Post('gifting/:id/accept')
  @ApiOperation({ summary: 'Aceptar un gift (item al inventario del receptor)' })
  @ApiResponse({ status: 200, description: 'Gift aceptado' })
  @ApiResponse({ status: 404, description: 'Gift no encontrado' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  accept(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.gifting.accept(user.id, id);
  }

  @Post('gifting/:id/reject')
  @ApiOperation({ summary: 'Rechazar un gift (item vuelve al sender)' })
  @ApiResponse({ status: 200, description: 'Gift rechazado' })
  @ApiResponse({ status: 404, description: 'Gift no encontrado' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  reject(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() body: { thankYouNote?: string } = {},
  ) {
    return this.gifting.reject(user.id, id, body.thankYouNote);
  }

  @Post('care-packages/send')
  @ApiOperation({ summary: 'Enviar un Care Package a un pet enfermo' })
  @ApiResponse({ status: 201, description: 'Care package enviado y aplicado' })
  @ApiResponse({ status: 400, description: 'Pet no enfermo o rate limit' })
  @ApiResponse({ status: 404, description: 'Destinatario/item no encontrado' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  sendCare(
    @CurrentUser() user: { id: string },
    @Body()
    body: {
      recipientUserId: string;
      petId: string;
      foodItemId: string;
      medicineItemId: string;
      toyItemId: string;
      note?: string;
    },
  ) {
    return this.care.sendCarePackage(user.id, body);
  }

  @Post('group-feeding/join')
  @ApiOperation({ summary: 'Crear o unirse a una room de Group Feeding' })
  @ApiResponse({ status: 201, description: 'Room creada / unirse con posición y minijuego' })
  @ApiResponse({ status: 400, description: 'Room llena o expirada' })
  @ApiResponse({ status: 404, description: 'Room no encontrada' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  joinGroup(
    @CurrentUser() user: { id: string },
    @Body() body: { code?: string; maxPlayers?: number } = {},
  ) {
    return this.groupFeeding.join(user.id, body);
  }

  @Post('group-feeding/:id/complete')
  @ApiOperation({ summary: 'Completar el minijuego de un jugador en la room' })
  @ApiResponse({ status: 200, description: 'Progreso actualizado (con reward si completo)' })
  @ApiResponse({ status: 404, description: 'Room no encontrada' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  completeGroup(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() body: { gameType?: string; score?: number },
  ) {
    return this.groupFeeding.completeMinigame(id, user.id, body.gameType ?? '', body.score ?? 0);
  }
}
