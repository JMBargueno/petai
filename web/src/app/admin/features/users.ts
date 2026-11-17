import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AdminAuth } from '../auth';
import { AdminUser, ROLES, options } from '../data/models';
import { USERS } from '../data/repository';
import { Column, Field, Filter, ResourcePage } from '../ui/resource-page';

@Component({
  selector: 'app-admin-users',
  imports: [ResourcePage],
  template: `
    <app-resource-page
      heading="Usuarios"
      [intro]="intro"
      [repo]="repo"
      [columns]="columns"
      [fields]="fields"
      [filter]="filter"
      [nameOf]="nameOf"
      [deletable]="false"
      [editable]="canEdit"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Users {
  protected readonly repo = inject(USERS);
  private readonly auth = inject(AdminAuth);
  protected readonly canAssignRoles = this.auth.can('users:role:assign');
  protected readonly canManageEconomy = this.auth.can('economy:manage');
  protected readonly canVerify = this.auth.can('users:verify');
  protected readonly canEdit = this.canAssignRoles || this.canManageEconomy || this.canVerify;
  protected readonly nameOf = (user: AdminUser) => user.email;

  protected readonly intro = this.canEdit
    ? 'Cuentas reales del servidor. Desde «Editar» se cambia el rol (cierra las sesiones de esa cuenta) y se fijan monedas y gemas (queda auditado).'
    : 'Cuentas reales del servidor.';

  protected readonly filter: Filter<AdminUser> = { key: 'role', label: 'Rol', options: options(ROLES) };

  protected readonly columns: Column<AdminUser>[] = [
    { key: 'email', label: 'Correo' },
    { key: 'handle', label: 'Nickname' },
    { key: 'displayName', label: 'Nombre' },
    { key: 'role', label: 'Rol', format: (u) => ROLES[u.role] ?? u.role },
    { key: 'coins', label: 'Monedas', type: 'number' },
    { key: 'gems', label: 'Gemas', type: 'number' },
    { key: 'accountXp', label: 'XP de cuenta', type: 'number' },
    { key: 'emailVerified', label: 'Verificado', type: 'bool' },
    { key: 'createdAt', label: 'Alta', type: 'date' },
  ];

  // Cada campo editable aparece solo si el administrador tiene el permiso que lo respalda en el servidor.
  protected readonly fields: Field<AdminUser>[] = [
    { key: 'email', label: 'Correo', type: 'email', required: true, lockedOnEdit: true },
    // El nickname es inmutable (lo garantiza la base de datos): solo se muestra.
    { key: 'handle', label: 'Nickname', type: 'text', lockedOnEdit: true },
    ...(this.canAssignRoles ? [{ key: 'role', label: 'Rol', type: 'select', options: options(ROLES), required: true } as Field<AdminUser>] : []),
    ...(this.canManageEconomy
      ? ([
          { key: 'coins', label: 'Monedas', type: 'number', required: true, min: 0 },
          { key: 'gems', label: 'Gemas', type: 'number', required: true, min: 0 },
        ] as Field<AdminUser>[])
      : []),
    ...(this.canVerify ? [{ key: 'emailVerified', label: 'Correo verificado', type: 'checkbox' } as Field<AdminUser>] : []),
  ];
}
