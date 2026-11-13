import { ApiProperty } from '@nestjs/swagger';

/**
 * Cuerpo de `POST /chests/open`. `chestId` debe ser el UUID de un cofre del usuario.
 * La validación (uuid válido, pertenencia, idempotencia) se resuelve de forma autoritativa en el
 * servicio (404/409), de modo que el endpoint nunca se queda en 500 por un id malformado.
 */
export class OpenChestDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', description: 'UUID del cofre a abrir' })
  chestId: string;
}