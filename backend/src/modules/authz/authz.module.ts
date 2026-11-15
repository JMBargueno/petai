import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { PermissionsGuard } from './permissions.guard';

/** Autorización por roles (RBAC): guard de permisos + gestión de usuarios/roles para administración. */
@Module({
  imports: [AuthModule],
  controllers: [AdminUsersController],
  providers: [AdminUsersService, PermissionsGuard],
  exports: [PermissionsGuard],
})
export class AuthzModule {}
