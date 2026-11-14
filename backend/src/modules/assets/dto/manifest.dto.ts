import { ApiProperty } from '@nestjs/swagger';

/** Entrada de un asset dentro del `manifest.assets` (contrato api-contract.md). */
export class AssetDto {
  @ApiProperty({
    example: 'sprites/ignisaur_idle-a3b2f1.svg',
    description: 'Ruta relativa versionada por hash (relativa al `baseUrl` del CDN).',
  })
  url: string;

  @ApiProperty({
    example: 'a3b2f1c9d0e1f204',
    description: 'MD5 hex del contenido — idempotente/inmutable.',
  })
  hash: string;

  @ApiProperty({
    example: 'image/svg+xml',
    description: 'MIME tipo: image/svg+xml, image/png, application/json, ...',
  })
  type: string;

  @ApiProperty({ example: 4213, description: 'Tamaño en bytes.' })
  size: number;
}

/**
 * Manifest de assets (idéntico al servido por `GET /assets/manifest`). `assets` mapea cada `key`
 * lógica (`sprites/...`, `patterns/...`, `species/.../base`, `game-data/...`) a su AssetDto.
 */
export class ManifestDto {
  @ApiProperty({
    example: '2026.11.13-a3b2f1',
    description: 'Versión del manifest (fecha + hash corto) — cambia con cada deploy.',
  })
  version: string;

  @ApiProperty({
    example: 'https://cdn.petai.app/assets/',
    description: 'Prefijo base del CDN; el `url` de cada asset es relativo a este.',
  })
  baseUrl: string;

  @ApiProperty({
    example: '2026-11-13T09:00:00.000Z',
    description: 'Fecha de generación del manifest (ISO 8601).',
  })
  generatedAt: string;

  @ApiProperty({
    description: 'Mapa `key → AssetDto` (AssetDto: `url`, `hash`, `type`, `size`).',
  })
  assets: Record<string, AssetDto>;
}