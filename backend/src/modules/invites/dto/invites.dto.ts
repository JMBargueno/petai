import { ApiProperty } from '@nestjs/swagger';
import { INVITE_STATUSES, MAX_INVITES_PER_REQUEST } from '../invites.schemas';

/** DTO solo para Swagger: la validación real está en invites.schemas.ts (zod). */
export class CreateInvitesDto {
  @ApiProperty({ required: false, default: 1, minimum: 1, description: 'Número de registros que permite cada código' })
  maxUses?: number;

  @ApiProperty({ required: false, nullable: true, type: String, format: 'date-time', description: 'Caducidad (opcional, futura)' })
  expiresAt?: string | null;

  @ApiProperty({ required: false, maxLength: 200, description: 'Nota interna (para quién es la invitación)' })
  note?: string;

  @ApiProperty({ required: false, default: 1, minimum: 1, maximum: MAX_INVITES_PER_REQUEST, description: 'Cuántos códigos generar' })
  count?: number;
}

export class RegistrationSettingsDto {
  @ApiProperty({ description: 'Si es true, el registro exige un código de invitación válido' })
  inviteOnly: boolean;
}

export class RegistrationConfigDto {
  @ApiProperty({ description: 'Si es true, el registro exige un código de invitación' })
  inviteRequired: boolean;
}

export class InviteCreatorDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty({ nullable: true, type: String }) displayName: string | null;
}

export class InviteCodeDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'ABCD-EF23' }) code: string;
  @ApiProperty() maxUses: number;
  @ApiProperty() usedCount: number;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) expiresAt: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) revokedAt: string | null;
  @ApiProperty({ nullable: true, type: String }) note: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: string;
  @ApiProperty({ nullable: true, type: InviteCreatorDto }) createdBy: InviteCreatorDto | null;
  @ApiProperty({ enum: INVITE_STATUSES }) status: (typeof INVITE_STATUSES)[number];
}

export class InviteListDto {
  @ApiProperty({ type: [InviteCodeDto] }) items: InviteCodeDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
}

export class CreatedInvitesDto {
  @ApiProperty({ type: [InviteCodeDto] }) items: InviteCodeDto[];
}
