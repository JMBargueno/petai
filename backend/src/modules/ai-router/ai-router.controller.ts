import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
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
@Controller('ai/models')
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
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        provider: { type: 'string', description: 'Proveedor por defecto' },
        routingOverrides: {
          type: 'object',
          description: 'Overrides por tarea: { tarea: { provider, model, maxTokens, maxCostUsd } }',
          additionalProperties: true,
        },
        fallbackProviders: { type: 'array', items: { type: 'string' }, description: 'Proveedores de respaldo' },
      },
    },
  })
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
