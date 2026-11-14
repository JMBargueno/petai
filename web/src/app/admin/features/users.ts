import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AdminUser, USER_STATUS, options } from '../data/models';
import { USERS } from '../data/repository';
import { Column, Field, Filter, ResourcePage } from '../ui/resource-page';

@Component({
  selector: 'app-admin-users',
  imports: [ResourcePage],
  template: `
    <app-resource-page
      heading="Usuarios"
      intro="Cuentas de ejemplo. Desde «Editar» se ajustan monedas y gemas o se suspende la cuenta."
      [repo]="repo"
      [columns]="columns"
      [fields]="fields"
      [filter]="filter"
      [nameOf]="nameOf"
      [deletable]="false"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Users {
  protected readonly repo = inject(USERS);
  protected readonly nameOf = (user: AdminUser) => user.email;

  protected readonly filter: Filter<AdminUser> = { key: 'status', label: 'Estado', options: options(USER_STATUS) };

  protected readonly columns: Column<AdminUser>[] = [
    { key: 'email', label: 'Correo' },
    { key: 'displayName', label: 'Nombre' },
    { key: 'coins', label: 'Monedas', type: 'number' },
    { key: 'gems', label: 'Gemas', type: 'number' },
    { key: 'accountXp', label: 'XP de cuenta', type: 'number' },
    { key: 'status', label: 'Estado', format: (u) => USER_STATUS[u.status] },
    { key: 'createdAt', label: 'Alta', type: 'date' },
  ];

  protected readonly fields: Field<AdminUser>[] = [
    { key: 'displayName', label: 'Nombre', type: 'text', required: true },
    { key: 'email', label: 'Correo', type: 'email', required: true, lockedOnEdit: true },
    { key: 'coins', label: 'Monedas', type: 'number', min: 0, required: true },
    { key: 'gems', label: 'Gemas', type: 'number', min: 0, required: true },
    { key: 'status', label: 'Estado', type: 'select', options: options(USER_STATUS), required: true },
  ];
}
