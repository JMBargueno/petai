import { Module } from '@nestjs/common';
import { SecurityController } from './security.controller';
import { TokenRotationService } from './token-rotation.service';
import { DeviceFingerprintService } from './device-fingerprint.service';
import { E2eEncryptionService } from './e2e-encryption.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [SecurityController],
  providers: [TokenRotationService, DeviceFingerprintService, E2eEncryptionService],
  exports: [TokenRotationService, DeviceFingerprintService, E2eEncryptionService],
})
export class SecurityModule {}
