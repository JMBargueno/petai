import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { BillingConfigService } from './billing-config.service';
import { EntitlementService } from './entitlement.service';
import { BillingService } from './billing.service';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingConfig: BillingConfigService,
    private readonly entitlement: EntitlementService,
    private readonly billing: BillingService,
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
  async googleRtdn(@Body() body: any) {
    if (body?.message?.data) {
      try {
        const decoded = JSON.parse(Buffer.from(body.message.data, 'base64').toString('utf8'));
        await this.billing.handleGoogleRtdn({
          messageId: body.message.messageId,
          ...decoded,
        });
      } catch (err) {
        // Ignorar mensajes mal formateados con 200 OK para confirmar a Pub/Sub
      }
    }
    return { ok: true };
  }
}
