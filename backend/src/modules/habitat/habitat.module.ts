import { Module } from '@nestjs/common';
import { HabitatController } from './habitat.controller';
import { HabitatService } from './habitat.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { GameDataModule } from '../game-data/game-data.module';

@Module({
  imports: [PrismaModule, GameDataModule],
  controllers: [HabitatController],
  providers: [HabitatService],
  exports: [HabitatService],
})
export class HabitatModule {}
