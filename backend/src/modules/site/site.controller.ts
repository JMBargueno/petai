import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SiteConfigDto } from './dto/site.dto';
import { SiteSettingsService } from './site-settings.service';

/** Configuración pública de la web (sin sesión): registro con invitación y landing «Coming soon». */
@ApiTags('Site')
@Controller('site')
export class SiteController {
  constructor(private readonly settings: SiteSettingsService) {}

  @Get('config')
  @ApiOperation({ summary: 'Configuración pública de la web (registro y landing «Coming soon»)' })
  @ApiResponse({ status: HttpStatus.OK, type: SiteConfigDto })
  config(): Promise<SiteConfigDto> {
    return this.settings.getPublicConfig();
  }
}
