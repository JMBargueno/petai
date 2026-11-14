import { Module } from '@nestjs/common';
import { ModdingController } from './modding.controller';
import { ModdingService } from './modding.service';
import { SandboxService } from './sandbox.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ModdingController],
  providers: [ModdingService, SandboxService],
  exports: [ModdingService, SandboxService],
})
export class ModdingModule {}
