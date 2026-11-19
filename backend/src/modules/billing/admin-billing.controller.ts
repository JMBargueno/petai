import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingConfigService } from './billing-config.service';
import { ManagedBudgetService } from './managed-budget.service';

class UpdateBillingConfigDto {
  data!: unknown;
  note?: string;
}

@ApiTags('Admin Billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('billing:manage')
@Controller('admin/billing')
export class AdminBillingController {
  constructor(
    private readonly billingConfig: BillingConfigService,
    private readonly managedBudget: ManagedBudgetService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('config')
  @ApiOperation({ summary: 'Obtener configuración activa de facturación e IA' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Configuración activa y número de versión' })
  getConfig() {
    return this.billingConfig.getConfig();
  }

  @Put('config')
  @ApiOperation({ summary: 'Guardar y activar una nueva versión de configuración de facturación' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Nueva versión creada y activada' })
  async updateConfig(
    @CurrentUser() user: any,
    @Body() body: UpdateBillingConfigDto,
  ) {
    const userId = user?.id || user?.userId || 'admin';
    return this.billingConfig.saveNewVersion(body.data, userId, body.note);
  }

  @Get('config/versions')
  @ApiOperation({ summary: 'Listar historial de versiones de configuración' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Historial de versiones' })
  listVersions() {
    return this.billingConfig.listVersions(50);
  }

  @Post('config/versions/:version/activate')
  @ApiOperation({ summary: 'Revertir / activar una versión histórica de configuración' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Versión reactivada' })
  async activateVersion(
    @CurrentUser() user: any,
    @Param('version', ParseIntPipe) version: number,
  ) {
    const userId = user?.id || user?.userId || 'admin';
    const config = await this.billingConfig.activateVersion(version, userId);
    return { version, data: config };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Métricas de negocio de suscripciones y gasto de IA' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Resumen de métricas de facturación' })
  async stats() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const currentMonth = now.toISOString().slice(0, 7);
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const [
      activeSubscribers,
      pastDueSubscribers,
      canceledSubscribers30d,
      dailySpendUsd,
      monthlyUsageAgg,
      activeUsersToday,
    ] = await Promise.all([
      this.prisma.subscription.count({
        where: { status: { in: ['active', 'trialing'] }, source: { not: 'voucher' } },
      }),
      this.prisma.subscription.count({
        where: { status: 'past_due', source: { not: 'voucher' } },
      }),
      this.prisma.subscription.count({
        where: {
          status: 'canceled',
          source: { not: 'voucher' },
          updatedAt: { gte: thirtyDaysAgo },
        },
      }),
      this.managedBudget.getDailySpendUsd(),
      this.prisma.aiUsage.aggregate({
        _sum: { costUsd: true },
        where: { month: currentMonth },
      }),
      this.prisma.aiUsage.count({
        where: {
          month: currentMonth,
          updatedAt: { gte: startOfToday },
        },
      }),
    ]);

    const pricing = this.billingConfig.pricingSettings();
    const monthlyPrice = pricing.monthlyPriceEur || pricing.monthlyPriceUsd || 9.99;
    const estimatedMrr = Math.round(activeSubscribers * monthlyPrice * 100) / 100;

    return {
      activeSubscribers,
      pastDueSubscribers,
      canceledSubscribers30d,
      estimatedMrr,
      currency: 'EUR',
      dailySpendUsd: Math.round(dailySpendUsd * 10000) / 10000,
      monthlySpendUsd: Math.round((monthlyUsageAgg._sum.costUsd || 0) * 10000) / 10000,
      activeFreeUsersToday: Math.max(0, activeUsersToday - activeSubscribers),
      activeConfigVersion: this.billingConfig.getConfig().version,
    };
  }
}
