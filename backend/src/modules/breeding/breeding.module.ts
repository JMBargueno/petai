import { Module } from '@nestjs/common';
import { BreedingController } from './breeding.controller';
import { BreedingService } from './breeding.service';
import { GeneticsEngineService } from './genetics-engine.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BreedingController],
  providers: [BreedingService, GeneticsEngineService],
  exports: [BreedingService, GeneticsEngineService],
})
export class BreedingModule {}
