import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { WebhooksService, RegisterWebhookDto } from './webhooks.service';
import { ApiKeyService, CreateApiKeyDto } from './api-key.service';

/**
 * WebhooksController — Feature 025. Gestión (JWT) de API keys y webhooks.
 * Los endpoints `/v1/public/*` viven en `PublicApiController` (autenticados por API key).
 */
@ApiTags('Webhooks & API Keys')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class WebhooksController {
  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly apiKeyService: ApiKeyService,
  ) {}

  // ── API Keys ──────────────────────────────────────────────────────────────

  @Post('apikeys')
  @ApiOperation({ summary: 'Crear una API key con scopes' })
  @ApiResponse({ status: 201, description: 'API key creada (key devuelta una vez)' })
  @ApiResponse({ status: 409, description: 'Límite de keys alcanzado' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'scopes'],
      properties: {
        name: { type: 'string', description: 'Nombre de la key' },
        scopes: { type: 'array', items: { type: 'string' }, description: 'Scopes de la key (p.ej. read:leaderboard)' },
      },
    },
  })
  createApiKey(@CurrentUser() user: { id: string }, @Body() dto: CreateApiKeyDto) {
    return this.apiKeyService.create(user.id, dto);
  }

  @Get('apikeys')
  @ApiOperation({ summary: 'Listar mis API keys' })
  @ApiResponse({ status: 200, description: 'Lista de keys' })
  listApiKeys(@CurrentUser() user: { id: string }) {
    return this.apiKeyService.list(user.id);
  }

  @Delete('apikeys/:id')
  @ApiOperation({ summary: 'Revocar una API key' })
  @ApiResponse({ status: 200, description: 'Key revocada' })
  revokeApiKey(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.apiKeyService.revoke(user.id, id);
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  @Post('webhooks')
  @ApiOperation({ summary: 'Registrar un webhook (HTTPS, max 10/user)' })
  @ApiResponse({ status: 201, description: 'Webhook creado' })
  @ApiResponse({ status: 400, description: 'URL inválida / SSRF' })
  @ApiResponse({ status: 409, description: 'Límite de webhooks' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['url', 'events'],
      properties: {
        url: { type: 'string', format: 'uri', description: 'URL HTTPS de destino' },
        events: { type: 'array', items: { type: 'string' }, description: 'Eventos a suscribir' },
        secret: { type: 'string', description: 'Secreto para firmar (HMAC, opcional)' },
      },
    },
  })
  registerWebhook(@CurrentUser() user: { id: string }, @Body() dto: RegisterWebhookDto) {
    return this.webhooksService.register(user.id, dto);
  }

  @Get('webhooks')
  @ApiOperation({ summary: 'Listar mis webhooks' })
  @ApiResponse({ status: 200, description: 'Lista de webhooks' })
  listWebhooks(@CurrentUser() user: { id: string }) {
    return this.webhooksService.list(user.id);
  }

  @Delete('webhooks/:id')
  @ApiOperation({ summary: 'Borrar un webhook' })
  @ApiResponse({ status: 200, description: 'Webhook eliminado' })
  removeWebhook(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.webhooksService.remove(user.id, id);
  }

  @Post('webhooks/:id/test')
  @ApiOperation({ summary: 'Probar un webhook (evento de test)' })
  @ApiResponse({ status: 201, description: 'Resultado del test' })
  testWebhook(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.webhooksService.test(user.id, id);
  }
}
