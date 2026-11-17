import { Module } from '@nestjs/common';
import { SiteController } from './site.controller';
import { SiteSettingsService } from './site-settings.service';

/**
 * Ajustes de la web pública. El controlador admin (AdminSiteController) se registra en AuthzModule,
 * igual que el de invitaciones, para no crear una dependencia circular con PermissionsGuard.
 */
@Module({
  controllers: [SiteController],
  providers: [SiteSettingsService],
  exports: [SiteSettingsService],
})
export class SiteModule {}
