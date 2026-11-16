import { Module } from '@nestjs/common';
import { ClansController } from './clans.controller';
import { ClansService } from './clans.service';
import { PresenceModule } from '../presence/presence.module';

/**
 * Clanes Module — clanes con XP compartida y presencia en línea por miembro.
 *
 * Importa `PresenceModule` para `PresenceService` (isOnline del roster). `PrismaService` es global.
 * No depende de `PresenceModule` en sentido inverso: el hook de XP del clan vive dentro de
 * `CoopCareService` (módulo presence) usando Prisma directamente, evitando un ciclo de dependencias.
 */
@Module({
  controllers: [ClansController],
  providers: [ClansService],
  imports: [PresenceModule],
  exports: [ClansService],
})
export class ClansModule {}
