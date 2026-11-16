import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'jugador@petai.local', description: 'Correo electrónico del usuario' })
  email: string;

  @ApiProperty({ example: 'ContrasenaSegura123!', description: 'Contraseña del usuario (mínimo 8 caracteres)' })
  password: string;

  @ApiProperty({ example: 'EntrenadorPet', required: false, description: 'Nombre mostrado del jugador' })
  displayName?: string;

  @ApiProperty({ example: 'ABCD-EF23', required: false, description: 'Código de invitación (obligatorio si el registro es solo con invitación)' })
  inviteCode?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'jugador@petai.local', description: 'Correo electrónico del usuario' })
  email: string;

  @ApiProperty({ example: 'ContrasenaSegura123!', description: 'Contraseña del usuario' })
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'Token de refresco rotativo' })
  refreshToken: string;
}

export class ChangePasswordDto {
  @ApiProperty({ description: 'Contraseña actual' })
  currentPassword: string;

  @ApiProperty({ description: 'Contraseña nueva (mínimo 8 caracteres, distinta de la actual)' })
  newPassword: string;
}

export class ResetRequestDto {
  @ApiProperty({ example: 'jugador@petai.local', description: 'Correo de la cuenta' })
  email: string;
}

export class ResetConfirmDto {
  @ApiProperty({ example: 'jugador@petai.local', description: 'Correo de la cuenta' })
  email: string;

  @ApiProperty({ example: '482913', description: 'Código de 6 dígitos recibido por email' })
  code: string;

  @ApiProperty({ example: 'NuevaContrasena123!', description: 'Contraseña nueva (mínimo 8 caracteres)' })
  newPassword: string;
}

export class AuthResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  refreshToken: string;

  @ApiProperty({
    type: 'object',
    properties: {
      id: { type: 'string' },
      email: { type: 'string' },
      role: { type: 'string', enum: ['superadmin', 'admin', 'moderator', 'user'] },
      displayName: { type: 'string' },
      coins: { type: 'number' },
      gems: { type: 'number' },
      emailVerified: { type: 'boolean', description: 'false: la cuenta debe verificar el correo antes de usar las apps' },
    },
  })
  user: {
    id: string;
    email: string;
    role: string;
    displayName?: string;
    coins: number;
    gems: number;
    emailVerified: boolean;
  };
}

export class VerifyEmailCodeDto {
  @ApiProperty({ example: '482913', description: 'Código de 6 dígitos recibido por email' })
  code: string;
}

export class VerifyEmailLinkDto {
  @ApiProperty({ description: 'Token del enlace de verificación (parámetro ?token= de la página /verify-email)' })
  token: string;
}

export class VerifyEmailResultDto {
  @ApiProperty({ example: true })
  ok: boolean;

  @ApiProperty({ example: true })
  emailVerified: boolean;
}
