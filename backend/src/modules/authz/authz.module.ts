import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InvitesModule } from '../invites/invites.module';
import { AdminInvitesController } from '../invites/admin-invites.controller';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { PermissionsGuard } from './permissions.guard';

/** Autorización por roles (RBAC): guard de permisos + gestión de usuarios/roles para administración. */
@Module({
  imports: [AuthModule, InvitesModule],
  controllers: [AdminUsersController, AdminInvitesController],
  providers: [AdminUsersService, PermissionsGuard],
  exports: [PermissionsGuard],
})
export class AuthzModule {}
