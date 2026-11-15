import { Module } from '@nestjs/common';
import { DesktopUpdatesController } from './desktop-updates.controller';
import { DesktopDownloadController } from './desktop-download.controller';
import { DesktopUpdatesService } from './desktop-updates.service';

@Module({
  controllers: [DesktopUpdatesController, DesktopDownloadController],
  providers: [DesktopUpdatesService],
})
export class DesktopUpdatesModule {}
