import { ChangeDetectionStrategy, Component, InjectionToken, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AdminAuth } from './auth';
import { AuditLog } from './data/audit-log';
import { ROLES, type AdminRole, type Entity } from './data/models';
import { ALL_REPOSITORIES, Repository } from './data/repository';

@Component({
  selector: 'app-admin-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="shell">
      <header class="top">
        <a class="brand" routerLink="/admin"><span class="logo__mark" aria-hidden="true">P</span>Pockai <span>Panel</span></a>
        <p class="tag demo">Usuarios: datos reales · resto de secciones: demostración</p>
        <div class="top__actions">
          @if (auth.user(); as user) {
            <span class="whoami">{{ user.email }} · {{ roleLabel(user.role) }}</span>
          }
          <button class="btn btn--sm" type="button" (click)="resetDialog.showModal()">Restablecer demo</button>
          <button class="btn btn--sm btn--filled" type="button" (click)="logout()">Salir</button>
        </div>
      </header>

      <nav class="side" aria-label="Secciones del panel">
        <p class="side__brand label-caps">Gestión</p>
        @for (link of links; track link.path) {
          <a
            class="btn"
            [routerLink]="link.path"
            routerLinkActive="is-active"
            ariaCurrentWhenActive="page"
          >
            {{ link.label }}
          </a>
        }
      </nav>

      <main class="main">
        <router-outlet />
      </main>
    </div>

    <dialog
      #resetDialog
      class="dialog"
      closedby="any"
      aria-labelledby="reset-title"
      (close)="onResetClose(resetDialog)"
    >
      <h2 id="reset-title">¿Restablecer los datos de demostración?</h2>
      <p>Se descartan los cambios hechos en este navegador en las secciones de demostración (precios, eventos, pockais). Los usuarios no se tocan.</p>
      <form method="dialog" class="dialog__actions">
        <button class="btn" value="cancel" autofocus>Cancelar</button>
        <button class="btn btn--filled" value="reset">Restablecer</button>
      </form>
    </dialog>
  `,
  styles: `
    .shell {
      display: grid;
      grid-template: 'side top' auto 'side main' 1fr / 248px minmax(0, 1fr);
      min-block-size: 100dvh;
      background:
        radial-gradient(60% 40% at 100% 0%, light-dark(rgb(233 204 255 / 0.5), rgb(92 74 222 / 0.18)) 0%, transparent 70%),
        var(--bg);
    }
    .top {
      grid-area: top;
      position: sticky;
      inset-block-start: 0;
      z-index: 5;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      padding: 12px 24px;
      border-block-end: 1px solid var(--line-soft);
      background: var(--surface-glass);
      backdrop-filter: saturate(1.6) blur(14px);
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      color: var(--ink);
      font-family: var(--font-lateral);
      font-size: 22px;
      line-height: 1;
      text-decoration: none;
      text-transform: uppercase;
    }
    .brand span:not(.logo__mark) {
      padding: 4px 8px;
      border-radius: var(--radius-pills);
      background: var(--surface-2);
      font-family: var(--font-aeonik-pro);
      font-weight: var(--font-weight-bold);
      font-size: var(--text-caption);
      letter-spacing: 0.06em;
    }
    .demo {
      margin: 0;
      border-color: transparent;
      background: color-mix(in srgb, var(--color-sunburst) 40%, var(--surface));
      white-space: normal;
    }
    .whoami {
      align-self: center;
      color: var(--ink-muted);
      font-size: var(--text-caption);
    }
    .top__actions {
      display: flex;
      gap: 8px;
      margin-inline-start: auto;
    }
    .side {
      grid-area: side;
      position: sticky;
      inset-block-start: 0;
      align-self: start;
      display: flex;
      flex-direction: column;
      gap: 4px;
      block-size: 100dvh;
      padding: 20px 14px;
      border-inline-end: 1px solid var(--line-soft);
      background: var(--surface);
    }
    .side__brand {
      margin: 0 8px 20px;
    }
    .side .btn {
      justify-content: start;
      border-color: transparent;
      box-shadow: none;
      background: transparent;
      color: var(--ink-muted);
    }
    .side .btn:hover {
      background: var(--surface-2);
      color: var(--ink);
    }
    .side .is-active,
    .side .is-active:hover {
      background: var(--grad-accent);
      color: #fff;
      box-shadow: var(--shadow-2);
    }
    .main {
      grid-area: main;
      min-inline-size: 0;
      padding: 28px;
    }
    h2 {
      margin: 0 0 8px;
      font-size: var(--text-subheading);
      line-height: var(--leading-subheading);
    }
    p {
      margin: 0;
    }
    .dialog__actions {
      display: flex;
      justify-content: end;
      gap: 8px;
      margin-block-start: 24px;
    }
    @media (width < 960px) {
      .shell {
        grid-template: 'top' auto 'side' auto 'main' 1fr / minmax(0, 1fr);
      }
      .side {
        position: static;
        flex-direction: row;
        block-size: auto;
        overflow-x: auto;
        padding: 10px 16px;
        border-inline-end: 0;
        border-block-end: 1px solid var(--line-soft);
      }
      .side__brand {
        display: none;
      }
      .main {
        padding: 16px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  protected readonly auth = inject(AdminAuth);
  protected readonly roleLabel = (role: string) => ROLES[role as AdminRole] ?? role;
  private readonly audit = inject(AuditLog);
  private readonly router = inject(Router);
  private readonly repositories = ALL_REPOSITORIES.map((token) =>
    inject(token as InjectionToken<Repository<Entity>>),
  );

  protected readonly links = [
    { path: 'resumen', label: 'Resumen' },
    { path: 'precios', label: 'Precios' },
    { path: 'eventos', label: 'Eventos' },
    { path: 'usuarios', label: 'Usuarios' },
    { path: 'pockais', label: 'Pockais' },
    { path: 'registro', label: 'Registro' },
  ];

  constructor() {
    inject(Title).setTitle('Panel de Pockai');
    inject(Meta).updateTag({ name: 'robots', content: 'noindex, nofollow' });
  }

  protected async logout() {
    await this.auth.logout();
    void this.router.navigateByUrl('/admin/login');
  }

  protected async onResetClose(dialog: HTMLDialogElement) {
    const confirmed = dialog.returnValue === 'reset';
    dialog.returnValue = '';
    if (!confirmed) return;
    await Promise.all(this.repositories.map((r) => r.reset()));
    this.audit.record('Sistema', 'panel', 'Datos restablecidos');
    location.reload();
  }
}
