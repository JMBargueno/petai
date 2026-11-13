import { ApiProperty } from '@nestjs/swagger';

/**
 * Cuerpo de `POST /chests/purchase`. Solo `bronze`, `silver` y `gold` son comprables (FR-010);
 * `diamond` y `mythic` deben rechazar con 400. La validación de `type` y `paymentMethod` se hace de
 * forma autoritativa en el servicio (400), además de documentarse aquí para Swagger.
 */
export class PurchaseChestDto {
  @ApiProperty({ enum: ['bronze', 'silver', 'gold'], example: 'bronze' })
  type: 'bronze' | 'silver' | 'gold' | string;

  @ApiProperty({ enum: ['coins', 'gems'], example: 'coins' })
  paymentMethod: 'coins' | 'gems' | string;
}