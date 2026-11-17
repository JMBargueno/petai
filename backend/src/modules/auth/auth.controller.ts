import { Controller, Get, Post, Body, HttpCode, HttpStatus, Query, Req, UseGuards } from '@nestjs/common';
import { InvitesService } from '../invites/invites.service';
import { RegistrationConfigDto } from '../invites/dto/invites.dto';
import type { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { DeviceLinkService } from './device-link.service';
import { PasswordResetService } from './password-reset.service';
import { EmailVerificationService } from './email-verification.service';
import { AllowUnverified } from './allow-unverified.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  AuthResponseDto,
  ChangePasswordDto,
  ResetRequestDto,
  ResetConfirmDto,
  VerifyEmailCodeDto,
  VerifyEmailLinkDto,
  VerifyEmailResultDto,
  HandleAvailabilityDto,
} from './dto/auth.dto';
import { clientIp } from '../../common/client-ip';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly deviceLink: DeviceLinkService,
    private readonly passwordReset: PasswordResetService,
    private readonly emailVerification: EmailVerificationService,
    private readonly invites: InvitesService,
  ) {}

  @Get('registration-config')
  @ApiOperation({ summary: 'Configuración pública del registro (¿hace falta invitación?)' })
  @ApiResponse({ status: HttpStatus.OK, type: RegistrationConfigDto })
  async registrationConfig(): Promise<RegistrationConfigDto> {
    return { inviteRequired: await this.invites.isInviteOnly() };
  }

  @Get('handle-available')
  @ApiOperation({ summary: 'Comprueba si un nickname es válido y está libre (público, con límite por IP)' })
  @ApiQuery({ name: 'handle', required: true, example: 'jmbargueno' })
  @ApiResponse({ status: HttpStatus.OK, type: HandleAvailabilityDto })
  handleAvailable(@Query('handle') handle: string, @Req() req: Request): Promise<HandleAvailabilityDto> {
    return this.authService.handleAvailability(handle, clientIp(req));
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
  @AllowUnverified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cerrar todas las sesiones del usuario en todos sus dispositivos' })
  logoutAll(@CurrentUser() user: any) {
    return this.authService.logoutAll(user.id);
  }

  @Post('password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @AllowUnverified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cambiar la contraseña: exige la actual, cierra las demás sesiones y devuelve tokens nuevos' })
  changePassword(@CurrentUser() user: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.id, dto);
  }

  @Post('verify-email/resend')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @AllowUnverified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reenviar el correo de verificación (código + enlace). Invalida los anteriores' })
  verifyEmailResend(@CurrentUser() user: any, @Req() req: Request) {
    return this.emailVerification.send(user.id, { ip: clientIp(req) });
  }

  @Post('verify-email/confirm')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @AllowUnverified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verificar el correo con el código de 6 dígitos (desde la app)' })
  @ApiResponse({ status: HttpStatus.OK, type: VerifyEmailResultDto })
  verifyEmailConfirm(@CurrentUser() user: any, @Body() dto: VerifyEmailCodeDto, @Req() req: Request) {
    return this.emailVerification.confirmCode(user.id, dto, clientIp(req));
  }

  @Post('verify-email/link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verificar el correo con el token del enlace (página web /verify-email, sin sesión)' })
  @ApiResponse({ status: HttpStatus.OK, type: VerifyEmailResultDto })
  verifyEmailLink(@Body() dto: VerifyEmailLinkDto, @Req() req: Request) {
    return this.emailVerification.confirmLink(dto, clientIp(req));
  }

  @Post('reset/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Solicitar un código de recuperación de contraseña por email (sin enumeración de cuentas)' })
  resetRequest(@Body() dto: ResetRequestDto, @Req() req: Request) {
    return this.passwordReset.request(dto, clientIp(req));
  }

  @Post('reset/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirmar la recuperación: con el código cambia la contraseña, cierra las demás sesiones y emite una sesión nueva' })
  resetConfirm(@Body() dto: ResetConfirmDto, @Req() req: Request) {
    return this.passwordReset.confirm(dto, clientIp(req));
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
