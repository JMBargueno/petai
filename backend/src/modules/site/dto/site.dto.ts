import { ApiProperty } from '@nestjs/swagger';
import { MAINTENANCE_SCOPES } from '../site.schemas';

/** DTOs solo para Swagger: la validación real está en site.schemas.ts (zod). */
export class SiteSettingsDto {
  @ApiProperty({ description: 'Landing «Coming soon» activa: tapa la web a quien no tenga sesión verificada' })
  comingSoonEnabled: boolean;

  @ApiProperty({ description: 'Mostrar la cuenta atrás en la landing' })
  comingSoonCountdownEnabled: boolean;

  @ApiProperty({ nullable: true, type: String, format: 'date-time', description: 'Fecha de lanzamiento de la cuenta atrás' })
  comingSoonLaunchAt: string | null;

  @ApiProperty({ description: 'Modo mantenimiento manual: solo pasan admins, login y contacto' })
  maintenanceEnabled: boolean;

  @ApiProperty({ enum: MAINTENANCE_SCOPES, description: 'A quién afecta: solo la web, solo las apps o todo' })
  maintenanceScope: string;

  @ApiProperty({ nullable: true, type: String, description: 'Mensaje en castellano (vacío = texto por defecto)' })
  maintenanceMessageEs: string | null;

  @ApiProperty({ nullable: true, type: String, description: 'Mensaje en inglés (vacío = texto por defecto)' })
  maintenanceMessageEn: string | null;
}

export class UpdateSiteSettingsDto {
  @ApiProperty({ required: false }) comingSoonEnabled?: boolean;
  @ApiProperty({ required: false }) comingSoonCountdownEnabled?: boolean;
  @ApiProperty({ required: false, nullable: true, type: String, format: 'date-time' }) comingSoonLaunchAt?: string | null;
  @ApiProperty({ required: false }) maintenanceEnabled?: boolean;
  @ApiProperty({ required: false, enum: MAINTENANCE_SCOPES }) maintenanceScope?: string;
  @ApiProperty({ required: false, nullable: true, type: String, maxLength: 1000 }) maintenanceMessageEs?: string | null;
  @ApiProperty({ required: false, nullable: true, type: String, maxLength: 1000 }) maintenanceMessageEn?: string | null;
}

export class SiteCountdownDto {
  @ApiProperty() enabled: boolean;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) launchAt: string | null;
}

export class SiteComingSoonDto {
  @ApiProperty() enabled: boolean;
  @ApiProperty({ type: SiteCountdownDto }) countdown: SiteCountdownDto;
}

export class SiteMaintenanceMessageDto {
  @ApiProperty({ nullable: true, type: String }) es: string | null;
  @ApiProperty({ nullable: true, type: String }) en: string | null;
}

export class SiteMaintenanceDto {
  @ApiProperty() enabled: boolean;
  @ApiProperty({ enum: MAINTENANCE_SCOPES }) scope: 'web' | 'apps' | 'all';
  @ApiProperty({ type: SiteMaintenanceMessageDto }) message: SiteMaintenanceMessageDto;
}

export class SiteConfigDto {
  @ApiProperty({ description: 'Si es true, el registro exige un código de invitación' })
  inviteRequired: boolean;

  @ApiProperty({ type: SiteComingSoonDto })
  comingSoon: SiteComingSoonDto;

  @ApiProperty({ type: SiteMaintenanceDto })
  maintenance: SiteMaintenanceDto;
}
