import { ApiProperty } from '@nestjs/swagger';

/** DTOs solo para Swagger: la validación real está en site.schemas.ts (zod). */
export class SiteSettingsDto {
  @ApiProperty({ description: 'Landing «Coming soon» activa: tapa la web a quien no tenga sesión verificada' })
  comingSoonEnabled: boolean;

  @ApiProperty({ description: 'Mostrar la cuenta atrás en la landing' })
  comingSoonCountdownEnabled: boolean;

  @ApiProperty({ nullable: true, type: String, format: 'date-time', description: 'Fecha de lanzamiento de la cuenta atrás' })
  comingSoonLaunchAt: string | null;
}

export class UpdateSiteSettingsDto {
  @ApiProperty({ required: false }) comingSoonEnabled?: boolean;
  @ApiProperty({ required: false }) comingSoonCountdownEnabled?: boolean;
  @ApiProperty({ required: false, nullable: true, type: String, format: 'date-time' }) comingSoonLaunchAt?: string | null;
}

export class SiteCountdownDto {
  @ApiProperty() enabled: boolean;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) launchAt: string | null;
}

export class SiteComingSoonDto {
  @ApiProperty() enabled: boolean;
  @ApiProperty({ type: SiteCountdownDto }) countdown: SiteCountdownDto;
}

export class SiteConfigDto {
  @ApiProperty({ description: 'Si es true, el registro exige un código de invitación' })
  inviteRequired: boolean;

  @ApiProperty({ type: SiteComingSoonDto })
  comingSoon: SiteComingSoonDto;
}
