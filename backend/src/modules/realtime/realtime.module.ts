import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeGateway } from './realtime.gateway';
import { PresenceModule } from '../presence/presence.module';
import { SiteModule } from '../site/site.module';

@Global()
@Module({
  imports: [JwtModule.register({}), PresenceModule, SiteModule],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
