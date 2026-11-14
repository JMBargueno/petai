import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DeltaSyncService, SyncAction, PushResponse, PullResponse } from './delta-sync.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

/**
 * Sync REST endpoints.
 * Feature 022: Offline-First CRDT Sync
 *
 * Endpoints:
 * - POST /v1/sync/push — push batch of offline actions
 * - GET /v1/sync/pull — pull delta state since version
 * - GET /v1/sync/status — get sync status
 */
@ApiTags('Sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly deltaSyncService: DeltaSyncService) {}

  @Post('push')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Push a batch of offline actions to server' })
  async push(
    @CurrentUser() user: any,
    @Body() body: { actions: SyncAction[] },
  ): Promise<PushResponse> {
    if (!body.actions || !Array.isArray(body.actions)) {
      throw new Error('actions array required');
    }
    return this.deltaSyncService.push(user.id, body.actions);
  }

  @Get('pull')
  @ApiOperation({ summary: 'Pull delta state since given version' })
  async pull(
    @CurrentUser() user: any,
    @Query('sinceVersion') sinceVersionRaw?: string,
  ): Promise<PullResponse> {
    const sinceVersion = sinceVersionRaw ? parseInt(sinceVersionRaw, 10) : 0;
    return this.deltaSyncService.pull(user.id, sinceVersion);
  }

  @Get('status')
  @ApiOperation({ summary: 'Get sync status for user' })
  async getStatus(@CurrentUser() user: any) {
    return this.deltaSyncService.getStatus(user.id);
  }
}
