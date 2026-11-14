import { Controller, Get, Inject, Optional, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AssetsService } from './assets.service';
import { MetricsService } from '../../observability/metrics.service';
import { ManifestDto } from './dto/manifest.dto';

/** Región del cliente (para las métricas por región, US4). Cloudflare expone `cf-ipcountry`. */
const regionOf = (req: Request): string =>
  (req.headers['cf-ipcountry'] as string) || (req.headers['x-region'] as string) || 'unknown';

/**
 * Endpoints origin de assets (feature 009-edge-cdn). Son el MIRROR/fallback del CDN:
 *   - `GET /v1/assets/manifest` (público)
 *   - `GET /v1/assets/:key`     (público)
 *
 * Cabeceras: manifest `max-age=3600, stale-while-revalidate=60`; asset `max-age=31536000, immutable`.
 */
@ApiTags('Assets')
@Controller('assets')
export class AssetsController {
  constructor(
    private readonly assetsService: AssetsService,
    @Optional() @Inject(MetricsService) private readonly metrics?: MetricsService,
  ) {}

  @Get('manifest')
  @ApiOperation({ summary: 'Índice versionado de assets (manifest). Público.' })
  @ApiResponse({ status: 200, type: ManifestDto, description: 'Manifest de assets' })
  @ApiResponse({ status: 500, description: 'Manifest no generado / shared inaccesible' })
  manifest(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const manifest = this.assetsService.getManifest();
    res
      .set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=60')
      .set('ETag', this.assetsService.getManifestEtag());
    return manifest;
  }

  @Get('*')
  @ApiOperation({ summary: 'Sirve un asset estático por `key` (fallback/mirror del CDN). Público.' })
  @ApiParam({ name: 'key', example: 'sprites/ignisaur_idle', description: 'Key lógica del manifest (sin hash).' })
  @ApiResponse({ status: 200, description: 'Contenido binario/JSON del asset' })
  @ApiResponse({ status: 400, description: 'Key mal formada (path traversal)' })
  @ApiResponse({ status: 404, description: 'Asset no encontrado' })
  @ApiResponse({ status: 500, description: 'Error interno de lectura' })
  asset(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // La ruta `*` no captura las `/`, así que reconstruimos la key a partir de la ruta real.
    const rawKey = this.extractAssetKey(req);
    const { buffer, type } = this.assetsService.getAsset(rawKey);
    // US4: un asset servido en origin es, a la vez, un hit y un fallback del CDN (el cliente llegó
    // a origin ⇒ el CDN/edge no lo resolvió). Se etiqueta por región del cliente.
    const region = regionOf(req);
    this.metrics?.recordCdnHit(region);
    this.metrics?.recordCdnFallbackOrigin(region);
    res.set('Content-Type', type).set('Cache-Control', 'public, max-age=31536000, immutable');
    return res.send(buffer);
  }

  /**
   * La ruta `*` no captura las `/`, así Nest las pierde. Reconstruimos la key a partir de la
   * ruta real quitando el prefijo `/assets/`.
   */
  private extractAssetKey(req: Request): string {
    const url = (req.originalUrl || req.url || '').split('?')[0];
    const marker = '/assets/';
    const idx = url.lastIndexOf(marker);
    if (idx >= 0) {
      const raw = url.slice(idx + marker.length);
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
    return '';
  }
}