import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ModelRouterService } from './model-router.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

/**
 * AI Router REST endpoints.
 * Feature 019: Multi-Model AI Router
 *
 * Endpoints:
 * - GET /v1/ai/models — list available models/providers
 * - POST /v1/ai/models/config — update routing config
 * - GET /v1/ai/models/budget — get current budget/usage
 */
@ApiTags('AI Router')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/ai/models')
export class AiRouterController {
  constructor(private readonly modelRouter: ModelRouterService) {}

  @Get()
  @ApiOperation({ summary: 'List available AI models and provider status' })
  getModels() {
    return this.modelRouter.getModels();
  }

  @Post('config')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update routing configuration for user' })
  updateConfig(
    @CurrentUser() user: any,
    @Body() body: {
      provider?: string;
      routingOverrides?: Record<string, { provider?: string; model?: string; maxTokens?: number; maxCostUsd?: number }>;
      fallbackProviders?: string[];
    },
  ) {
    return this.modelRouter.updateConfig(user.id, body);
  }

  @Get('budget')
  @ApiOperation({ summary: 'Get current AI usage and budget for user' })
  getBudget(@CurrentUser() user: any) {
    return this.modelRouter.getBudget(user.id);
  }
}
