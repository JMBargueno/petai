import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { SiteController } from './site.controller';
import { SiteSettingsService } from './site-settings.service';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceGuard } from './maintenance.guard';

/**
 * Ajustes de la web pública. El controlador admin (AdminSiteController) se registra en AuthzModule,
 * igual que el de invitaciones, para no crear una dependencia circular con PermissionsGuard.
 * Registra además el guard global del modo mantenimiento.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [SiteController],
  providers: [SiteSettingsService, MaintenanceService, { provide: APP_GUARD, useClass: MaintenanceGuard }],
  exports: [SiteSettingsService, MaintenanceService],
})
export class SiteModule {}
