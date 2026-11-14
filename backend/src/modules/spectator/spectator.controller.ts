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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SpectatorService, LiveBattleState, SpectatorSubscription } from './spectator.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

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
    if (!battleId) {
      throw new Error('battleId query parameter required');
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
  subscribe(
    @CurrentUser() user: any,
    @Body() body: { battleId: string },
  ): SpectatorSubscription {
    if (!body.battleId) {
      throw new Error('battleId required');
    }
    return this.spectatorService.subscribe(body.battleId, user.id);
  }
}
