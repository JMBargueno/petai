import { Module } from '@nestjs/common';
import { AchievementsModule } from '../achievements/achievements.module';
import { ProfileService } from './profile.service';
import { MyProfileController, PublicProfileController } from './profile.controller';

/** Perfil social: Mi Perfil, perfil público de otros jugadores e insignias destacadas. */
@Module({
  imports: [AchievementsModule],
  controllers: [MyProfileController, PublicProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
