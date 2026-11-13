import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { DeviceLinkService } from './device-link.service';
import { AuthThrottleService } from './auth-throttle.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService, DeviceLinkService, JwtStrategy, AuthThrottleService],
  exports: [AuthService, PassportModule],
})
export class AuthModule {}
