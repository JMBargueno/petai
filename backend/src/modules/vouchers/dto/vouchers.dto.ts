import { ApiProperty } from '@nestjs/swagger';
import { REWARD_CHEST_TYPES, REWARD_LIMITS } from '../rewards.schemas';
import { MAX_VOUCHERS_PER_REQUEST, VOUCHER_STATUSES } from '../vouchers.schemas';

/** DTOs solo para Swagger: la validación real está en rewards.schemas.ts y vouchers.schemas.ts (zod). */
export class RewardChestDto {
  @ApiProperty({ enum: REWARD_CHEST_TYPES }) type: (typeof REWARD_CHEST_TYPES)[number];
  @ApiProperty({ minimum: 1, maximum: REWARD_LIMITS.chestQty }) qty: number;
}

export class RewardsDto {
  @ApiProperty({ required: false, minimum: 0, maximum: REWARD_LIMITS.coins }) coins?: number;
  @ApiProperty({ required: false, minimum: 0, maximum: REWARD_LIMITS.gems }) gems?: number;
  @ApiProperty({ required: false, minimum: 0, maximum: REWARD_LIMITS.proDays, description: 'Días de Pro (exige billing:manage)' })
  proDays?: number;
  @ApiProperty({ required: false, type: [RewardChestDto] }) chests?: RewardChestDto[];
  @ApiProperty({ required: false, type: [String], description: 'Ids de prendas de accessories.json' }) accessories?: string[];
}

export class CreateVouchersDto {
  @ApiProperty({ required: false, example: 'NAVIDAD2026', description: 'Código personalizado (si falta, se generan `count` aleatorios)' })
  code?: string;
  @ApiProperty({ required: false, default: 1, minimum: 1, maximum: MAX_VOUCHERS_PER_REQUEST }) count?: number;
  @ApiProperty({ required: false, default: 1, minimum: 1, description: 'Canjes totales permitidos (cada cuenta, una vez)' }) maxUses?: number;
  @ApiProperty({ required: false, nullable: true, type: String, format: 'date-time' }) expiresAt?: string | null;
  @ApiProperty({ required: false, maxLength: 200 }) note?: string;
  @ApiProperty({ type: RewardsDto }) rewards: RewardsDto;
}

export class GrantRewardsDto {
  @ApiProperty({ type: RewardsDto }) rewards: RewardsDto;
  @ApiProperty({ required: false, maxLength: 200, description: 'Mensaje que verá el jugador en el aviso' }) note?: string;
}

export class RedeemVoucherDto {
  @ApiProperty({ example: 'ABCD-EF23' }) code: string;
}

class VoucherCreatorDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty({ nullable: true, type: String }) displayName: string | null;
}

export class VoucherDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'ABCD-EF23' }) code: string;
  @ApiProperty({ type: RewardsDto }) rewards: RewardsDto;
  @ApiProperty() maxUses: number;
  @ApiProperty() usedCount: number;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) expiresAt: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) revokedAt: string | null;
  @ApiProperty({ nullable: true, type: String }) note: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: string;
  @ApiProperty({ nullable: true, type: VoucherCreatorDto }) createdBy: VoucherCreatorDto | null;
  @ApiProperty({ enum: VOUCHER_STATUSES }) status: (typeof VOUCHER_STATUSES)[number];
}

export class VoucherListDto {
  @ApiProperty({ type: [VoucherDto] }) items: VoucherDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
}

export class CreatedVouchersDto {
  @ApiProperty({ type: [VoucherDto] }) items: VoucherDto[];
}

class GrantedAccessoryDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ description: 'Ya la tenía: no se ha dado otra' }) alreadyOwned: boolean;
}

export class GrantedRewardsDto {
  @ApiProperty() coins: number;
  @ApiProperty() gems: number;
  @ApiProperty() proDays: number;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) proUntil: string | null;
  @ApiProperty({ type: [RewardChestDto] }) chests: RewardChestDto[];
  @ApiProperty({ type: [GrantedAccessoryDto] }) accessories: GrantedAccessoryDto[];
}

/** Respuesta del canje y del regalo, y payload del evento WebSocket `reward:received`. */
export class RewardReceivedDto {
  @ApiProperty({ enum: ['voucher', 'admin_grant'] }) source: 'voucher' | 'admin_grant';
  @ApiProperty({ description: 'Id único de la entrega (para no celebrarla dos veces)' }) redemptionId: string;
  @ApiProperty({ required: false }) code?: string;
  @ApiProperty({ required: false }) note?: string;
  @ApiProperty({ type: GrantedRewardsDto }) granted: GrantedRewardsDto;
}
