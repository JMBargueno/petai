import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

const slot = z.string().min(1).max(64).nullable().optional();

/**
 * Cuerpo de `PUT /pets/:petId/accessories`. Cada ranura admite un itemId (equipar), `null` (quitar)
 * o nada (no tocar). Hay que indicar al menos una.
 */
export const equipAccessoriesSchema = z
  .object({ head: slot, face: slot, neck: slot, back: slot })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Indica al menos una ranura' });
export type EquipAccessoriesInput = z.infer<typeof equipAccessoriesSchema>;

/** DTO solo para Swagger: la validación real es la del esquema zod de arriba. */
export class EquipAccessoriesDto {
  @ApiProperty({ required: false, nullable: true, description: 'Prenda de cabeza; null la quita' }) head?: string | null;
  @ApiProperty({ required: false, nullable: true, description: 'Prenda de cara; null la quita' }) face?: string | null;
  @ApiProperty({ required: false, nullable: true, description: 'Prenda de cuello; null la quita' }) neck?: string | null;
  @ApiProperty({ required: false, nullable: true, description: 'Prenda de espalda; null la quita' }) back?: string | null;
}
