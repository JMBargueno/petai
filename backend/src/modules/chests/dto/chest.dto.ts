import { ApiProperty } from '@nestjs/swagger';

/**
 * Respuesta de un cofre (grid, apertura, compra). Los campos de `type`, `source` y los tiers de
 * drop siguen los enums del contrato `contracts/api-contract.md`.
 */
export class ChestResponse {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ enum: ['bronze', 'silver', 'gold', 'diamond', 'mythic'] })
  type: string;

  @ApiProperty({ enum: ['daily_mission', 'battle', 'evolution', 'purchase', 'event'] })
  source: string;

  @ApiProperty({ example: '2026-11-13T10:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: null, nullable: true, required: false, description: 'Fecha de apertura; null si no está abierto' })
  openedAt?: Date | null;
}

export class ChestListResponse {
  @ApiProperty({ type: [ChestResponse] })
  chests: ChestResponse[];
}

/** Un item resuelto por la apertura de un cofre (FR-003). */
export class DropItem {
  @ApiProperty({ example: 'food_apple', description: 'ID del item en el catálogo Item' })
  itemId: string;

  @ApiProperty({ example: 'Manzana' })
  name: string;

  @ApiProperty({ example: 3, minimum: 1, maximum: 99, description: 'Cantidad otorgada (cap 99; excedente → monedas)' })
  qty: number;

  @ApiProperty({ enum: ['common', 'uncommon', 'rare', 'epic', 'legendary'] })
  tier: string;

  @ApiProperty({ example: true, description: 'true si el usuario no tenía ese item antes de la apertura' })
  isNew: boolean;
}

/** Progreso de pity de un usuario para un tipo de cofre. */
export class PityProgress {
  @ApiProperty({ example: 3, description: 'Aperturas consecutivas sin drop >= minTier' })
  count: number;

  @ApiProperty({ example: 10 })
  threshold: number;

  @ApiProperty({ example: 'rare', enum: ['common', 'uncommon', 'rare', 'epic', 'legendary'] })
  minTier: string;
}

export class OpenChestResponse {
  @ApiProperty({ type: ChestResponse })
  chest: ChestResponse;

  @ApiProperty({ type: [DropItem] })
  drops: DropItem[];

  @ApiProperty({ type: PityProgress })
  pityProgress: PityProgress;
}

export class PurchaseChestResponse {
  @ApiProperty({ type: ChestResponse })
  chest: ChestResponse;

  @ApiProperty({ example: 65 })
  coinsRemaining: number;

  @ApiProperty({ example: 5 })
  gemsRemaining: number;
}