import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InvitesModule } from '../invites/invites.module';
import { AdminInvitesController } from '../invites/admin-invites.controller';
import { SiteModule } from '../site/site.module';
import { AdminSiteController } from '../site/admin-site.controller';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { AdminPetsController } from './admin-pets.controller';
import { AdminPetsService } from './admin-pets.service';
import { PermissionsGuard } from './permissions.guard';

/** Autorización por roles (RBAC): guard de permisos + gestión de usuarios/roles para administración. */
@Module({
  imports: [AuthModule, InvitesModule, SiteModule],
  controllers: [AdminUsersController, AdminInvitesController, AdminPetsController, AdminSiteController],
  providers: [AdminUsersService, AdminPetsService, PermissionsGuard],
  exports: [PermissionsGuard],
})
export class AuthzModule {}
