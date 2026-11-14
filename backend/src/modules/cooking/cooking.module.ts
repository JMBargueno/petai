import { Module } from '@nestjs/common';
import { CookingController } from './cooking.controller';
import { CookingService } from './cooking.service';
import { PetsModule } from '../pets/pets.module';
import { GameDataModule } from '../game-data/game-data.module';

@Module({
  imports: [PetsModule, GameDataModule],
  controllers: [CookingController],
  providers: [CookingService],
})
export class CookingModule {}