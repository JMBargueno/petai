import { ApiProperty } from '@nestjs/swagger';
import { DropItem } from './chest.dto';

/** Una apertura registrada en el historial (FR-011). */
export class OpeningRecord {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  chestId: string;

  @ApiProperty({ enum: ['bronze', 'silver', 'gold', 'diamond', 'mythic'] })
  type: string;

  @ApiProperty({ type: [DropItem] })
  drops: DropItem[];

  @ApiProperty({ example: '2026-11-13T10:10:00.000Z' })
  openedAt: Date;
}

export class ChestHistoryResponse {
  @ApiProperty({ type: [OpeningRecord] })
  openings: OpeningRecord[];

  @ApiProperty({ example: 120, description: 'Total de aperturas registradas del usuario' })
  total: number;
}