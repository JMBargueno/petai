import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'jugador@petai.local', description: 'Correo electrónico del usuario' })
  email: string;

  @ApiProperty({ example: 'ContrasenaSegura123!', description: 'Contraseña del usuario (mínimo 8 caracteres)' })
  password: string;

  @ApiProperty({ example: 'EntrenadorPet', required: false, description: 'Nombre mostrado del jugador' })
  displayName?: string;
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

export class AuthResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  refreshToken: string;

  @ApiProperty({
    example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
    description:
      'Refresh JWT fast-path (RS256) para el edge. Claims: sub, jti, iat, exp, typ="refresh". El edge lo verifica stateless contra /auth/jwks.',
  })
  refreshFastPath: string;

  @ApiProperty()
  user: {
    id: string;
    email: string;
    displayName?: string;
    coins: number;
    gems: number;
  };
}
