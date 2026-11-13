import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { DeviceLinkService } from './device-link.service';
import { AuthThrottleService } from './auth-throttle.service';
import { RateLimitGuard } from './rate-limit.guard';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    DeviceLinkService,
    JwtStrategy,
    AuthThrottleService,
    // Límite global de peticiones: se aplica a todas las rutas de la aplicación
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
  exports: [AuthService, PassportModule],
})
export class AuthModule {}
