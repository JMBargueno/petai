import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { DeviceLinkService } from './device-link.service';
import { PasswordResetService } from './password-reset.service';
import { AuthThrottleService } from './auth-throttle.service';
import { RateLimitGuard } from './rate-limit.guard';
import { ConsoleEmailSender, EMAIL_SENDER } from './email.service';
import { InvitesModule } from '../invites/invites.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
    InvitesModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    DeviceLinkService,
    PasswordResetService,
    JwtStrategy,
    AuthThrottleService,
    // Costura de email: por defecto un transporte de consola; en producción se sobreescribe EMAIL_SENDER.
    { provide: EMAIL_SENDER, useClass: ConsoleEmailSender },
    // Límite global de peticiones: se aplica a todas las rutas de la aplicación
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
  exports: [AuthService, PassportModule],
})
export class AuthModule {}
