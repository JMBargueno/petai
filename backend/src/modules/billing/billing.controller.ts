import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { BillingConfigService } from './billing-config.service';
import { EntitlementService } from './entitlement.service';
import { BillingService } from './billing.service';
import { GooglePlayClient } from './google-play.client';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(
    private readonly billingConfig: BillingConfigService,
    private readonly entitlement: EntitlementService,
    private readonly billing: BillingService,
    private readonly googlePlay: GooglePlayClient,
    private readonly config: ConfigService,
  ) {}

  @Get('plans')
  @ApiOperation({ summary: 'Obtener los planes, precios y límites vigentes' })
  async getPlans() {
    const config = this.billingConfig.getConfig().data;
    return {
      pricing: config.pricing,
      plans: {
        free: {
          name: 'Free',
          priceUsd: 0,
          priceEur: 0,
          dailyMessages: config.free.dailyMessages,
          maxInputChars: config.free.maxInputChars,
          maxOutputTokens: config.free.maxOutputTokens,
          agentTools: config.free.agentTools,
        },
        pro: {
          name: 'Pro',
          priceUsd: config.pricing.monthlyPriceUsd,
          priceEur: config.pricing.monthlyPriceEur,
          dailyMessages: config.pro.dailyMessages,
          maxInputChars: config.pro.maxInputChars,
          maxOutputTokens: config.pro.maxOutputTokens,
          agentTools: config.pro.agentTools,
        },
        byok: {
          name: 'BYOK',
          priceUsd: 0,
          priceEur: 0,
          dailyMessages: null, // Sin límite diario
          maxInputChars: config.byok.maxInputChars,
          rateLimitPerMinute: config.byok.rateLimitPerMinute,
        },
      },
    };
  }

  @Get('entitlement')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Consultar el estado de suscripción y entitlement del usuario autenticado' })
  async getEntitlement(@CurrentUser() user: any) {
    return this.entitlement.getDetails(user.id);
  }

  @Post('google/verify')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Verificar y reconocer una compra de Google Play Billing' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['purchaseToken', 'productId'],
      properties: {
        purchaseToken: { type: 'string' },
        productId: { type: 'string' },
      },
    },
  })
  async verifyGooglePurchase(
    @CurrentUser() user: any,
    @Body() body: { purchaseToken: string; productId: string },
  ) {
    return this.billing.verifyGooglePlayPurchase(user.id, body.purchaseToken, body.productId);
  }

  @Post('google/rtdn')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recepción de notificaciones en tiempo real (RTDN) de Google Play Pub/Sub' })
  async googleRtdn(@Body() body: any, @Headers('authorization') authorization?: string) {
    // Solo se aceptan push autenticados de Pub/Sub (JWT OIDC de la cuenta de servicio configurada)
    if (this.googlePlay.isRtdnAuthConfigured) {
      if (!(await this.googlePlay.verifyPubSubToken(authorization))) {
        throw new UnauthorizedException('Push de Pub/Sub no autenticado');
      }
    } else {
      const mockAllowed =
        this.config.get<string>('BILLING_MOCK_ENABLED') === 'true' && this.config.get<string>('NODE_ENV') !== 'production';
      if (!mockAllowed) throw new ServiceUnavailableException('RTDN de Google Play no configurado');
    }

    let decoded: any;
    try {
      decoded = body?.message?.data ? JSON.parse(Buffer.from(body.message.data, 'base64').toString('utf8')) : null;
    } catch {
      decoded = null;
    }
    // Mensaje mal formado: 200 para que Pub/Sub no lo reintente indefinidamente
    if (!decoded || typeof body.message.messageId !== 'string') {
      this.logger.warn('RTDN mal formado; se descarta');
      return { ok: true };
    }

    // Errores de procesamiento se propagan (5xx) para que Pub/Sub reintente
    await this.billing.handleGoogleRtdn({ ...decoded, messageId: body.message.messageId });
    return { ok: true };
  }
}
