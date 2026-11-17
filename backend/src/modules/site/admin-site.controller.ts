import { Body, Controller, Get, HttpStatus, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { SiteSettingsDto, UpdateSiteSettingsDto } from './dto/site.dto';
import { SiteSettingsService } from './site-settings.service';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('site:manage')
@Controller('admin/site-settings')
export class AdminSiteController {
  constructor(private readonly settings: SiteSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Ajustes de la web pública (landing «Coming soon»)' })
  @ApiResponse({ status: HttpStatus.OK, type: SiteSettingsDto })
  get() {
    return this.settings.getSettings();
  }

  @Patch()
  @ApiOperation({ summary: 'Cambiar los ajustes de la web pública (queda auditado)' })
  @ApiResponse({ status: HttpStatus.OK, type: SiteSettingsDto })
  set(@CurrentUser() actor: any, @Body() body: UpdateSiteSettingsDto) {
    return this.settings.setSettings(actor, body);
  }
}
