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
      [editable]="canAssignRoles"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Users {
  protected readonly repo = inject(USERS);
  protected readonly canAssignRoles = inject(AdminAuth).can('users:role:assign');
  protected readonly nameOf = (user: AdminUser) => user.email;

  protected readonly intro = this.canAssignRoles
    ? 'Cuentas reales del servidor. Desde «Editar» se cambia el rol; el cambio cierra las sesiones de esa cuenta.'
    : 'Cuentas reales del servidor.';

  protected readonly filter: Filter<AdminUser> = { key: 'role', label: 'Rol', options: options(ROLES) };

  protected readonly columns: Column<AdminUser>[] = [
    { key: 'email', label: 'Correo' },
    { key: 'displayName', label: 'Nombre' },
    { key: 'role', label: 'Rol', format: (u) => ROLES[u.role] ?? u.role },
    { key: 'coins', label: 'Monedas', type: 'number' },
    { key: 'gems', label: 'Gemas', type: 'number' },
    { key: 'accountXp', label: 'XP de cuenta', type: 'number' },
    { key: 'createdAt', label: 'Alta', type: 'date' },
  ];

  protected readonly fields: Field<AdminUser>[] = [
    { key: 'email', label: 'Correo', type: 'email', required: true, lockedOnEdit: true },
    { key: 'role', label: 'Rol', type: 'select', options: options(ROLES), required: true },
  ];
}
