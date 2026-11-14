import { Controller, Get, Post, Body, HttpCode, HttpStatus, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { DeviceLinkService } from './device-link.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { RegisterDto, LoginDto, RefreshTokenDto, AuthResponseDto, ChangePasswordDto } from './dto/auth.dto';
import { FastPathJwtService } from './fast-path-jwt';

/** IP del cliente (con TRUST_PROXY configurado respeta X-Forwarded-For del proxy de confianza). */
const clientIp = (req: Request) => req.ip || req.socket?.remoteAddress || 'unknown';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly deviceLink: DeviceLinkService,
    private readonly fastPath: FastPathJwtService,
  ) {}

  @Get('jwks')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'JWKS público del fast-path de refresh (RS256). Lo consume el edge para verificar el refresh JWT sin estado.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'JWKS (solo claves públicas)' })
  jwks() {
    return this.fastPath.buildJwks();
  }

  @Post('register')
  @ApiOperation({ summary: 'Registrar nuevo usuario' })
  @ApiResponse({ status: HttpStatus.CREATED, type: AuthResponseDto })
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, clientIp(req));
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión con credenciales' })
  @ApiResponse({ status: HttpStatus.OK, type: AuthResponseDto })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, clientIp(req));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar Access Token mediante Refresh Token' })
  refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    return this.authService.refresh(dto, clientIp(req));
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar sesión: revoca el refresh token' })
  logout(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    return this.authService.logout(dto, clientIp(req));
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cerrar todas las sesiones del usuario en todos sus dispositivos' })
  logoutAll(@CurrentUser() user: any) {
    return this.authService.logoutAll(user.id);
  }

  @Post('password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cambiar la contraseña: exige la actual, cierra las demás sesiones y devuelve tokens nuevos' })
  changePassword(@CurrentUser() user: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.id, dto);
  }

  @Post('device/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar vinculación: devuelve un código de 6 dígitos y un pollToken' })
  deviceStart(@Req() req: Request) {
    return this.deviceLink.start(clientIp(req));
  }

  @Post('device/confirm')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirmar el código mostrado en otro dispositivo (requiere sesión)' })
  deviceConfirm(@CurrentUser() user: any, @Body() body: unknown, @Req() req: Request) {
    return this.deviceLink.confirm(user.id, body, clientIp(req));
  }

  @Post('device/poll')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consultar la vinculación: pending o confirmed con la sesión nueva' })
  devicePoll(@Body() body: unknown, @Req() req: Request) {
    return this.deviceLink.poll(body, clientIp(req));
  }
}
