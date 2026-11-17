import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { CoopCareService, FriendshipSummary } from './coop-care.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

/**
 * Amistad + Co-op (feature 021 / spec-21) — endpoints para gestionar la amistad entre usuarios.
 *
 *   - GET   /v1/coop/friends            → mis relaciones (amigos + peticiones)
 *   - POST  /v1/coop/friends            → enviar petición de amistad { handle | targetUserId }
 *   - POST  /v1/coop/friends/:id/accept → aceptar (solo quien recibió la petición)
 *   - POST  /v1/coop/friends/:id/decline → rechazar (solo quien recibió la petición)
 *
 * La amistad aceptada habilita las visitas co-op (`POST /v1/coop/visit`) y la presencia mutua
 * (`GET /v1/presence/:userId`, S-15). Las rutas de visita/historial viven en `PresenceController`.
 */
@ApiTags('Presence & Co-op')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('coop/friends')
export class CoopFriendsController {
  constructor(private readonly coopCareService: CoopCareService) {}

  @Get()
  @ApiOperation({ summary: 'Mis relaciones de amistad (amigos aceptados + peticiones)' })
  list(@CurrentUser() user: any): Promise<FriendshipSummary[]> {
    return this.coopCareService.listFriendships(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enviar una petición de amistad (por @nickname o id del destinatario)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        handle: { type: 'string', example: 'jmbargueno', description: 'Nickname del destinatario (con o sin "@")' },
        targetUserId: { type: 'string', description: 'Alternativa a handle: id del destinatario' },
      },
    },
  })
  request(
    @CurrentUser() user: any,
    @Body() body: { targetUserId?: string; handle?: string; email?: string },
  ): Promise<FriendshipSummary> {
    if (!body?.targetUserId && !body?.handle && !body?.email) {
      throw new BadRequestException('Indica el @nickname del jugador');
    }
    return this.coopCareService.requestFriendship(body, user.id);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aceptar una petición de amistad recibida' })
  accept(@CurrentUser() user: any, @Param('id') friendshipId: string): Promise<FriendshipSummary> {
    return this.coopCareService.acceptFriendship(friendshipId, user.id);
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rechazar una petición de amistad recibida' })
  decline(@CurrentUser() user: any, @Param('id') friendshipId: string): Promise<FriendshipSummary> {
    return this.coopCareService.declineFriendship(friendshipId, user.id);
  }
}