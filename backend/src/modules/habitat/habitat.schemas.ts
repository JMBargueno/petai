import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

/** Celda y giro de un mueble. `x`/`y` hasta 63 (las salas miden 14×10; margen para salas futuras). */
const cell = z.number().int().min(0).max(63);
const rotation = z.number().int().min(0).max(3);
/** Sala destino: solo cuenta para los muebles de cualquier sala (`room: "*"`, spec 42). */
const roomId = z.string().regex(/^[a-z0-9_]{1,32}$/);

/**
 * Cuerpo opcional de `POST /habitat/furniture/:id/place`. Sin cuerpo (clientes antiguos) el mueble
 * se coloca en el primer hueco donde quepa. `x` e `y` van juntos.
 */
export const placeFurnitureSchema = z
  .object({ x: cell.optional(), y: cell.optional(), rotation: rotation.optional(), roomId: roomId.optional() })
  .refine((v) => (v.x === undefined) === (v.y === undefined), { message: 'x e y van juntos', path: ['x'] });
export type PlaceFurnitureInput = z.infer<typeof placeFurnitureSchema>;

/** Cuerpo de `PATCH /habitat/items/:itemId` (mover y/o girar; lo que no se envía se conserva). */
export const moveFurnitureSchema = z
  .object({ x: cell.optional(), y: cell.optional(), rotation: rotation.optional(), roomId: roomId.optional() })
  .refine((v) => v.x !== undefined || v.y !== undefined || v.rotation !== undefined || v.roomId !== undefined, {
    message: 'Indica x/y o rotation',
  });
export type MoveFurnitureInput = z.infer<typeof moveFurnitureSchema>;

/** DTOs solo para Swagger: la validación real es la de los esquemas zod de arriba. */
export class PlaceFurnitureDto {
  @ApiProperty({ required: false, minimum: 0, description: 'Celda ancla x (con y)' }) x?: number;
  @ApiProperty({ required: false, minimum: 0, description: 'Celda ancla y (con x)' }) y?: number;
  @ApiProperty({ required: false, minimum: 0, maximum: 3, description: 'Giro en pasos de 90°' }) rotation?: number;
  @ApiProperty({ required: false, description: 'Sala destino (solo muebles de cualquier sala)' }) roomId?: string;
}

export class MoveFurnitureDto extends PlaceFurnitureDto {}
