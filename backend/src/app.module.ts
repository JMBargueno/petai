import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.config';
import { PrismaModule } from './prisma/prisma.module';
import { GameDataModule } from './modules/game-data/game-data.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { HatchingModule } from './modules/hatching/hatching.module';
import { PetsModule } from './modules/pets/pets.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { RealtimeModule } from './modules/realtime/realtime.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', 'backend/.env'],
      validate: validateEnv,
    }),
    PrismaModule,
    RealtimeModule,
    GameDataModule,
    AuthModule,
    UsersModule,
    HatchingModule,
    PetsModule,
    InventoryModule,
  ],
})
export class AppModule {}
