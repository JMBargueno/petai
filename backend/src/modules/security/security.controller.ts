import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { TokenRotationService } from './token-rotation.service';
import { DeviceFingerprintService, FingerprintFeatures } from './device-fingerprint.service';
import { E2eEncryptionService } from './e2e-encryption.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * SecurityController — Feature 026. Zero-trust: token rotation, fingerprinting y E2E.
 */
@ApiTags('Security')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/security')
export class SecurityController {
  constructor(
    private readonly tokenRotation: TokenRotationService,
    private readonly fingerprint: DeviceFingerprintService,
    private readonly e2e: E2eEncryptionService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('rotate-token')
  @ApiOperation({ summary: 'Rotar el refresh token (con reuse detection)' })
  @ApiResponse({ status: 200, description: 'Nuevo refresh token' })
  @ApiResponse({ status: 401, description: 'Token inválido/expirado/reutilizado' })
  rotateToken(
    @CurrentUser() user: { id: string },
    @Body('refreshToken') refreshToken: string,
    @Req() req: Request,
  ) {
    return this.tokenRotation.rotateToken(user.id, refreshToken, {
      ip: this.clientIp(req),
      userAgent: req.headers['user-agent'],
    });
  }

  @Get('device-status')
  @ApiOperation({ summary: 'Estado de seguridad del dispositivo (score, flag)' })
  @ApiResponse({ status: 200, description: 'Estado del dispositivo' })
  deviceStatus(@CurrentUser() user: { id: string }) {
    return this.fingerprint.deviceStatus(user.id);
  }

  @Post('verify')
  @ApiOperation({ summary: 'Computar/actualizar fingerprint + score' })
  @ApiResponse({ status: 201, description: 'Fingerprint verificado' })
  async verify(
    @CurrentUser() user: { id: string },
    @Body() features: FingerprintFeatures,
    @Req() req: Request,
  ) {
    const result = await this.fingerprint.verify(user.id, features, this.clientIp(req));
    if (result.ipChanged) {
      await this.tokenRotation.audit(user.id, 'ip_change', {
        ip: this.clientIp(req),
        userAgent: req.headers['user-agent'],
        fingerprint: result.fingerprint,
      });
    }
    return result;
  }

  @Post('e2e/public-key')
  @ApiOperation({ summary: 'Guardar la public key P-256 (E2E)' })
  @ApiResponse({ status: 201, description: 'Public key guardada' })
  @ApiResponse({ status: 400, description: 'PEM inválido' })
  storePublicKey(@CurrentUser() user: { id: string }, @Body('publicKey') publicKey: string) {
    return this.e2e.storePublicKey(user.id, publicKey);
  }

  @Get('audit')
  @ApiOperation({ summary: 'Últimos 100 eventos de auditoría del usuario' })
  @ApiResponse({ status: 200, description: 'Eventos de auditoría' })
  async audit(@CurrentUser() user: { id: string }) {
    const logs = await this.prisma.auditLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return logs;
  }

  private clientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
    return req.ip ?? req.socket?.remoteAddress ?? null as unknown as string;
  }
}
