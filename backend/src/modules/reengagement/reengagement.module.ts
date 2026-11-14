import { Module } from '@nestjs/common';
import { ReengagementController } from './reengagement.controller';
import { ReengagementService } from './reengagement.service';
import { DiaryService } from './diary.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ReengagementController],
  providers: [ReengagementService, DiaryService],
  exports: [ReengagementService, DiaryService],
})
export class ReengagementModule {}
