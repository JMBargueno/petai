import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Solo documenta Swagger; la validación real está en contact.schemas.ts (zod). */
export class ContactDto {
  @ApiProperty({ example: 'Ana', description: 'Nombre (1–100)' })
  name: string;

  @ApiProperty({ example: 'ana@example.com', description: 'Correo al que responder' })
  email: string;

  @ApiProperty({ example: 'Duda sobre mi Pockai', description: 'Asunto (1–150)' })
  subject: string;

  @ApiProperty({ example: 'Hola, quería preguntar…', description: 'Mensaje (10–5000)' })
  message: string;

  @ApiPropertyOptional({ description: 'Honeypot anti-spam: debe ir vacío' })
  website?: string;
}
