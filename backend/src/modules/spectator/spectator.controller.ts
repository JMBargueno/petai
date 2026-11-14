import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { SpectatorService, LiveBattleState, SpectatorSubscription } from './spectator.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodPipe } from '../../common/zod.pipe';
import { spectatorSubscribeSchema } from './spectator.schemas';

/**
 * Combat Spectator REST endpoints.
 * Feature 023: Combat Spectator
 *
 * Endpoints:
 * - GET /v1/spectator/live — live battle state (with 10s delay)
 * - GET /v1/spectator/highlights — top highlights
 * - POST /v1/spectator/subscribe — subscribe to battle
 */
@ApiTags('Spectator')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('spectator')
export class SpectatorController {
  constructor(private readonly spectatorService: SpectatorService) {}

  @Get('live')
  @ApiOperation({ summary: 'Get live battle state (10s delay applied)' })
  getLive(@Query('battleId') battleId: string): LiveBattleState | null {
    // S-10: query param ausente → 400 (antes `throw new Error` → 500).
    if (!battleId) {
      throw new BadRequestException('battleId es obligatorio');
    }
    return this.spectatorService.getLiveState(battleId);
  }

  @Get('highlights')
  @ApiOperation({ summary: 'Get top combat highlights (weekly feed)' })
  getHighlights(@Query('limit') limitRaw?: string): Promise<unknown[]> {
    const limit = limitRaw ? parseInt(limitRaw, 10) : 20;
    return this.spectatorService.getHighlights(Math.min(limit, 50));
  }

  @Post('subscribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Subscribe to a battle as spectator' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['battleId'],
      properties: {
        battleId: { type: 'string', description: 'Pelea a la que suscribirse' },
      },
    },
  })
  subscribe(
    @CurrentUser() user: any,
    @Body(new ZodPipe(spectatorSubscribeSchema)) body: { battleId: string },
  ): SpectatorSubscription {
    // S-10: `battleId` se valida en el pipe (spectatorSubscribeSchema) → 400 si falta.
    return this.spectatorService.subscribe(body.battleId, user.id);
  }
}
