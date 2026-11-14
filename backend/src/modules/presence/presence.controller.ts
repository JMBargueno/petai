import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PresenceService } from './presence.service';
import { CoopCareService } from './coop-care.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

/**
 * Presence + Co-op REST endpoints.
 * Feature 021: Multi-Device Presence + Co-op
 *
 * Endpoints:
 * - GET /v1/presence/:userId — device presence list
 * - POST /v1/coop/visit — perform a visit action
 * - GET /v1/coop/history — visit history
 */
@ApiTags('Presence & Co-op')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1')
export class PresenceController {
  constructor(
    private readonly presenceService: PresenceService,
    private readonly coopCareService: CoopCareService,
  ) {}

  // ── Presence ──────────────────────────────────────────────────────────────────

  @Get('presence/:userId')
  @ApiOperation({ summary: 'Get device presence for a user' })
  getPresence(@Param('userId') userId: string) {
    return {
      userId,
      devices: this.presenceService.getPresence(userId),
      hasActiveDevices: this.presenceService.hasActiveDevices(userId),
    };
  }

  // ── Co-op Visits ──────────────────────────────────────────────────────────────

  @Post('coop/visit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Perform a co-op visit action on a friend\'s pet' })
  async visit(
    @CurrentUser() user: any,
    @Body() body: {
      ownerId: string;
      petId: string;
      action: 'feed' | 'play' | 'clean';
      itemId?: string;
    },
  ) {
    return this.coopCareService.processVisit(body.ownerId, user.id, {
      action: body.action,
      petId: body.petId,
      itemId: body.itemId,
    });
  }

  @Get('coop/history')
  @ApiOperation({ summary: 'Get visit history for my pets' })
  async getVisitHistory(
    @CurrentUser() user: any,
  ) {
    return {
      userId: user.id,
      visits: await this.coopCareService.getVisitHistory(user.id),
    };
  }
}
