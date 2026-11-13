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

export class AuthResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  refreshToken: string;

  @ApiProperty()
  user: {
    id: string;
    email: string;
    displayName?: string;
    coins: number;
    gems: number;
  };
}
