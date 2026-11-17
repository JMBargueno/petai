import { Controller, ForbiddenException, Get, Header, HttpStatus, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AllowUnverified, EMAIL_NOT_VERIFIED } from '../auth/allow-unverified.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { DesktopUpdatesService, INSTALLER_PLATFORMS, InstallerPlatform } from './desktop-updates.service';

export class DesktopDownloadDto {
  @ApiProperty({ description: 'URL firmada y temporal (unos minutos) del instalador en GitHub' })
  url: string;
}

/**
 * Descarga del instalador desde la web (botón «Descargar»), SOLO para cuentas con el correo verificado:
 *   - `GET /v1/desktop/download/:platform` → `{ url }` con la URL firmada del instalador del último
 *     release PUBLICADO. La web la abre con `location.href`.
 * Devuelve JSON y no un 302 porque la web necesita enviar el Bearer (un `<a href>` no puede).
 * La verificación se exige siempre, aunque EMAIL_VERIFICATION_REQUIRED=false, por eso la ruta va con
 * `@AllowUnverified()` y lo comprueba aquí (y también ignora el bloqueo por nickname).
 * El updater de Tauri usa otra ruta (`/v1/desktop/updates/download/:assetId`), que sigue pública.
 */
@ApiTags('Desktop updates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@AllowUnverified()
@Controller('desktop/download')
export class DesktopDownloadController {
  constructor(private readonly updates: DesktopUpdatesService) {}

  @Get(':platform')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'URL de descarga del instalador más reciente. Requiere sesión con el correo verificado.' })
  @ApiParam({ name: 'platform', enum: INSTALLER_PLATFORMS })
  @ApiResponse({ status: HttpStatus.OK, type: DesktopDownloadDto })
  @ApiResponse({ status: 401, description: 'Sin sesión' })
  @ApiResponse({ status: 403, description: 'Correo sin verificar (code: EMAIL_NOT_VERIFIED)' })
  @ApiResponse({ status: 404, description: 'Plataforma desconocida o sin instalador publicado' })
  async download(
    @Param('platform') platform: string,
    @CurrentUser() user: { emailVerifiedAt?: Date | null },
  ): Promise<DesktopDownloadDto> {
    if (!(INSTALLER_PLATFORMS as readonly string[]).includes(platform)) {
      throw new NotFoundException('Plataforma desconocida');
    }
    if (!user?.emailVerifiedAt) {
      throw new ForbiddenException({
        statusCode: 403,
        code: EMAIL_NOT_VERIFIED,
        message: 'Verifica tu correo electrónico para descargar Pockai',
      });
    }
    const assetId = await this.updates.findInstallerAssetId(platform as InstallerPlatform);
    return { url: await this.updates.getDownloadUrl(assetId) };
  }
}
