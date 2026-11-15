import { Module } from '@nestjs/common';
import { InvitesService } from './invites.service';

/**
 * Invitaciones de registro. Solo expone el servicio: lo usan AuthModule (canje en el registro) y
 * AuthzModule (que registra AdminInvitesController junto al resto de endpoints de administración,
 * evitando así una dependencia circular Auth ↔ Authz).
 */
@Module({
  providers: [InvitesService],
  exports: [InvitesService],
})
export class InvitesModule {}
