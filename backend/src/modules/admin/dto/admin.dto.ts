import { ApiProperty } from '@nestjs/swagger';
import { EVENT_SOURCES } from '../admin-overview.service';

/** DTOs solo para Swagger: la validación real está en admin.schemas.ts (zod). */

export class AdminItemDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'food' }) kind: string;
  @ApiProperty() name: string;
  @ApiProperty() description: string;
  @ApiProperty() priceCoins: number;
  @ApiProperty() priceGems: number;
}

export class UpdateItemPriceDto {
  @ApiProperty({ required: false, minimum: 0 }) priceCoins?: number;
  @ApiProperty({ required: false, minimum: 0 }) priceGems?: number;
}

export class BulkPriceDto {
  @ApiProperty({ type: [String] }) ids: string[];
  @ApiProperty({ minimum: -90, maximum: 500, description: 'Porcentaje entero de ajuste' }) percent: number;
  @ApiProperty({ enum: ['priceCoins', 'priceGems'] }) currency: 'priceCoins' | 'priceGems';
}

export class BulkPriceResultDto {
  @ApiProperty({ type: [AdminItemDto] }) items: AdminItemDto[];
  @ApiProperty({ description: 'Objetos cuyo precio cambió' }) changed: number;
}

export class AdminSpeciesDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() description: string;
  @ApiProperty() element: string;
  @ApiProperty() rarity: string;
  @ApiProperty() hp: number;
  @ApiProperty() atk: number;
  @ApiProperty() def: number;
  @ApiProperty() vel: number;
  @ApiProperty() esp: number;
  @ApiProperty() favoriteFood: string;
  @ApiProperty() spriteKey: string;
}

export class AdminPetDto {
  @ApiProperty() id: string;
  @ApiProperty() nickname: string;
  @ApiProperty() speciesId: string;
  @ApiProperty() rarity: string;
  @ApiProperty() level: number;
  @ApiProperty() stage: string;
  @ApiProperty() shiny: boolean;
  @ApiProperty() sick: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: string;
  @ApiProperty({ description: 'Correo del dueño' }) owner: string;
}

export class AdminPetListDto {
  @ApiProperty({ type: [AdminPetDto] }) items: AdminPetDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
}

export class AdminEventDto {
  @ApiProperty({ example: 'festival:halloween' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: EVENT_SOURCES }) source: string;
  @ApiProperty({ example: '2026-10-31' }) startDate: string;
  @ApiProperty({ example: '2026-10-31' }) endDate: string;
  @ApiProperty() enabled: boolean;
  @ApiProperty({ description: 'Ya terminó por su estado (torneo resuelto, raid liquidada…)' }) finished: boolean;
  @ApiProperty() detail: string;
}

export class AdminAuditEntryDto {
  @ApiProperty() id: string;
  @ApiProperty() userId: string;
  @ApiProperty({ nullable: true, type: String }) userEmail: string | null;
  @ApiProperty({ example: 'role_change' }) event: string;
  @ApiProperty({ nullable: true, type: String }) ip: string | null;
  @ApiProperty({ nullable: true, type: Object }) metadata: unknown;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: string;
}

export class AdminAuditListDto {
  @ApiProperty({ type: [AdminAuditEntryDto] }) items: AdminAuditEntryDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
}

export class AdminStatsUsersDto {
  @ApiProperty() total: number;
  @ApiProperty({ type: Object, example: { user: 10, admin: 1 } }) byRole: Record<string, number>;
}

export class AdminStatsPetsDto {
  @ApiProperty() total: number;
  @ApiProperty({ type: Object, example: { normal: 8, rare: 2 } }) byRarity: Record<string, number>;
}

export class AdminStatsDto {
  @ApiProperty({ type: AdminStatsUsersDto }) users: AdminStatsUsersDto;
  @ApiProperty({ type: AdminStatsPetsDto }) pets: AdminStatsPetsDto;
  @ApiProperty() items: number;
  @ApiProperty({ type: [AdminEventDto] }) upcomingEvents: AdminEventDto[];
}
