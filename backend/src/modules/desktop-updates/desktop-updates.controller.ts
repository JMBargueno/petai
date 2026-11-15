import { Controller, Get, Param, ParseIntPipe, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DesktopUpdatesService } from './desktop-updates.service';

/**
 * Endpoints del updater de la app de escritorio (Tauri). Públicos: los consulta el plugin updater
 * antes de cualquier login.
 *   - `GET /v1/desktop/updates/:target/:arch/:currentVersion` → 200 manifest | 204 sin novedad
 *   - `GET /v1/desktop/updates/download/:assetId`             → 302 a la URL firmada de GitHub
 */
@ApiTags('Desktop updates')
@Controller('desktop/updates')
export class DesktopUpdatesController {
  constructor(private readonly updates: DesktopUpdatesService) {}

  @Get('download/:assetId')
  @ApiOperation({ summary: 'Redirige a la descarga del instalador de una actualización. Público.' })
  @ApiParam({ name: 'assetId', example: 123456 })
  @ApiResponse({ status: 302, description: 'Redirección a la URL temporal de descarga' })
  @ApiResponse({ status: 404, description: 'El asset no pertenece al release actual' })
  async download(@Param('assetId', ParseIntPipe) assetId: number, @Res() res: Response) {
    const url = await this.updates.getDownloadUrl(assetId);
    res.set('Cache-Control', 'no-store').redirect(302, url);
  }

  @Get(':target/:arch/:currentVersion')
  @ApiOperation({ summary: 'Comprueba si hay una versión más nueva de la app de escritorio. Público.' })
  @ApiParam({ name: 'target', example: 'windows' })
  @ApiParam({ name: 'arch', example: 'x86_64' })
  @ApiParam({ name: 'currentVersion', example: '0.1.0' })
  @ApiResponse({ status: 200, description: 'Hay actualización (formato dinámico del updater de Tauri)' })
  @ApiResponse({ status: 204, description: 'No hay actualización' })
  async check(
    @Param('target') target: string,
    @Param('arch') arch: string,
    @Param('currentVersion') currentVersion: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const update = await this.updates.findUpdate(target, arch, currentVersion);
    res.set('Cache-Control', 'no-store');
    if (!update) return res.status(204).send();

    // La ruta de descarga cuelga de la misma base que esta petición (respeta `trust proxy`).
    // Se quitan los tres últimos segmentos (`:target/:arch/:currentVersion`) para quedarse con `/v1/desktop/updates`.
    const path = req.originalUrl.split('?')[0].replace(/\/[^/]+\/[^/]+\/[^/]+\/?$/, '');
    const base = `${req.protocol}://${req.get('host')}${path}`;
    const { assetId, ...manifest } = update;
    return res.status(200).json({ ...manifest, url: `${base}/download/${assetId}` });
  }
}
