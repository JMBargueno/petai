import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController, UsersAchievementsController } from './users.controller';
import { AchievementsModule } from '../../achievements/achievements.module';

@Module({
  imports: [AchievementsModule],
  controllers: [UsersController, UsersAchievementsController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
