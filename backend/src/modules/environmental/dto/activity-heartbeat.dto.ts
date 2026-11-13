import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Body de `POST /environmental/activity` (documentado para OpenAPI). La validación se hace de forma
 * manual en el controlador (sin class-validator, que no es una dependencia del proyecto): `active`
 * debe ser booleano y `cpuUsage` (opcional) un número ≥ 0.
 */
export class ActivityHeartbeatDto {
  @ApiProperty({ description: '¿El PC está activo ahora?', example: true, required: false })
  active?: boolean;

  @ApiPropertyOptional({ description: 'Uso de CPU (%)', example: 42.5, required: false })
  cpuUsage?: number;
}
