import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminAuth } from '../auth';
import { AdminUser, ROLES, options } from '../data/models';
import { USERS } from '../data/repository';
import { VOUCHERS, describeRewards, emptyRewards, hasRewards, type AccessoryOption, type ItemOption, type Rewards } from '../data/vouchers-http';
import { Column, Field, Filter, ResourcePage, RowAction } from '../ui/resource-page';
import { RewardsForm } from '../ui/rewards-form';

@Component({
  selector: 'app-admin-users',
  imports: [ResourcePage, FormsModule, RewardsForm],
  styleUrl: '../ui/resource-page.css',
  styles: `
    .dialog--wide {
      inline-size: min(640px, 100% - 32px);
    }
    .notice {
      margin: 0 0 12px;
      padding: 12px 16px;
      border: 1px solid var(--line-soft);
      border-radius: var(--radius-cards);
      background: var(--surface);
    }
  `,
  template: `
    @if (grantNotice(); as n) {
      <p class="notice" role="status">{{ n }}</p>
    }
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
      [rowActions]="rowActions"
    />

    <dialog #grantDialog class="dialog dialog--wide" aria-labelledby="users-grant-title">
      <form class="form" ngNativeValidate (ngSubmit)="grant()">
        <h2 id="users-grant-title">Dar recompensa · {{ grantTarget()?.email }}</h2>
        <p>Se acredita al momento y el jugador lo verá con una celebración en sus apps. Queda en el registro.</p>
        <app-rewards-form [(value)]="rewards" [accessories]="accessories()" [items]="items()" [canGrantPro]="canGrantPro" />
        <div class="field">
          <label for="users-grant-note">Mensaje para el jugador (opcional)</label>
          <input class="input" id="users-grant-note" name="note" type="text" maxlength="200" placeholder="¡Gracias por tu paciencia!" [(ngModel)]="note" />
        </div>
        @if (grantError(); as e) {
          <p class="error" role="alert">{{ e }}</p>
        }
        <div class="dialog__actions">
          <button class="btn" type="button" (click)="grantDialog.close()">Cancelar</button>
          <button class="btn btn--filled" type="submit" [disabled]="granting()">Dar recompensa</button>
        </div>
      </form>
    </dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Users {
  protected readonly repo = inject(USERS);
  private readonly auth = inject(AdminAuth);
  private readonly vouchers = inject(VOUCHERS);
  private readonly grantDialog = viewChild.required<ElementRef<HTMLDialogElement>>('grantDialog');
  private readonly page = viewChild.required(ResourcePage<AdminUser>);

  protected readonly canAssignRoles = this.auth.can('users:role:assign');
  protected readonly canManageEconomy = this.auth.can('economy:manage');
  protected readonly canVerify = this.auth.can('users:verify');
  protected readonly canGrant = this.auth.can('vouchers:manage');
  protected readonly canGrantPro = this.auth.can('billing:manage');
  protected readonly canEdit = this.canAssignRoles || this.canManageEconomy || this.canVerify;
  protected readonly nameOf = (user: AdminUser) => user.email;

  protected readonly grantTarget = signal<AdminUser | null>(null);
  protected readonly rewards = signal<Rewards>(emptyRewards());
  protected readonly accessories = signal<AccessoryOption[]>([]);
  protected readonly items = signal<ItemOption[]>([]);
  protected readonly granting = signal(false);
  protected readonly grantError = signal<string | null>(null);
  protected readonly grantNotice = signal<string | null>(null);
  protected note = '';

  protected readonly intro = this.canEdit
    ? 'Cuentas reales del servidor. Desde «Editar» se cambia el rol (cierra las sesiones de esa cuenta) y se fijan monedas y gemas (queda auditado).'
    : 'Cuentas reales del servidor.';

  protected readonly filter: Filter<AdminUser> = { key: 'role', label: 'Rol', options: options(ROLES) };

  protected readonly rowActions: RowAction<AdminUser>[] = this.canGrant
    ? [{ label: 'Dar recompensa', run: (user) => this.openGrant(user) }]
    : [];

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

  private openGrant(user: AdminUser) {
    this.grantTarget.set(user);
    this.rewards.set(emptyRewards());
    this.note = '';
    this.grantError.set(null);
    if (!this.accessories().length) {
      this.vouchers.accessories().then(
        (list) => this.accessories.set(list),
        () => undefined,
      );
    }
    if (!this.items().length) {
      this.vouchers.items().then(
        (list) => this.items.set(list),
        () => undefined,
      );
    }
    this.grantDialog().nativeElement.showModal();
  }

  protected async grant() {
    const user = this.grantTarget();
    if (!user) return;
    if (!hasRewards(this.rewards())) {
      this.grantError.set('Añade al menos una recompensa');
      return;
    }
    this.granting.set(true);
    this.grantError.set(null);
    try {
      const { granted } = await this.vouchers.grant(user.id, this.rewards(), this.note);
      const names = new Map(granted.accessories.map((a) => [a.id, a.alreadyOwned ? `${a.name} (ya la tenía)` : a.name]));
      this.grantNotice.set(
        `Recompensa dada a ${user.email}: ${describeRewards(
          { ...granted, accessories: granted.accessories.map((a) => a.id), items: (granted.items ?? []).map((i) => ({ id: i.id, qty: i.qty })) },
          (id) => names.get(id) ?? id,
          (id) => granted.items?.find((i) => i.id === id)?.name ?? id,
        )}`,
      );
      this.grantDialog().nativeElement.close();
      // El saldo ha cambiado: se recarga la tabla.
      void this.page().store.load();
    } catch (e) {
      this.grantError.set(e instanceof Error ? e.message : 'Error inesperado');
    } finally {
      this.granting.set(false);
    }
  }
}
