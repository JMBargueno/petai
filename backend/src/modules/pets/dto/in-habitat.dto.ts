import { ApiProperty } from '@nestjs/swagger';

export class UpdateInHabitatDto {
  @ApiProperty({
    description: 'Indica si la mascota se encuentra dentro de su hábitat (casa) en el cliente de escritorio',
    example: true,
  })
  inHabitat!: boolean;
}
