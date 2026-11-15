import { Module } from '@nestjs/common';
import { AuthzModule } from '../authz/authz.module';
import { GameDataModule } from '../game-data/game-data.module';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminController } from './admin.controller';
import { AdminOverviewService } from './admin-overview.service';
import { AdminRecordsService } from './admin-records.service';

/** Panel de administración: precios, especies, mascotas, eventos, auditoría y métricas. */
@Module({
  imports: [AuthzModule, GameDataModule],
  controllers: [AdminController],
  providers: [AdminCatalogService, AdminOverviewService, AdminRecordsService],
})
export class AdminModule {}
