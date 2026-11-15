import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DesktopUpdatesService, INSTALLER_PLATFORMS, InstallerPlatform } from './desktop-updates.service';

/**
 * Enlace fijo de descarga del instalador para la web (botón «Descargar»):
 *   - `GET /v1/desktop/download/:platform` → 302 al instalador del último release PUBLICADO.
 * Al publicar un release nuevo el enlace pasa a servirlo sin redesplegar la web (caché de 5 min).
 */
@ApiTags('Desktop updates')
@Controller('desktop/download')
export class DesktopDownloadController {
  constructor(private readonly updates: DesktopUpdatesService) {}

  @Get(':platform')
  @ApiOperation({ summary: 'Descarga el instalador más reciente de la app de escritorio. Público.' })
  @ApiParam({ name: 'platform', enum: INSTALLER_PLATFORMS })
  @ApiResponse({ status: 302, description: 'Redirección a la descarga del instalador' })
  @ApiResponse({ status: 404, description: 'Plataforma desconocida o sin instalador publicado' })
  async download(@Param('platform') platform: string, @Res() res: Response) {
    if (!(INSTALLER_PLATFORMS as readonly string[]).includes(platform)) {
      throw new NotFoundException('Plataforma desconocida');
    }
    const assetId = await this.updates.findInstallerAssetId(platform as InstallerPlatform);
    const url = await this.updates.getDownloadUrl(assetId);
    res.set('Cache-Control', 'no-store').redirect(302, url);
  }
}
