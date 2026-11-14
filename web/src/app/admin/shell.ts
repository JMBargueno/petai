import { ChangeDetectionStrategy, Component, InjectionToken, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AdminAuth } from './auth';
import { AuditLog } from './data/audit-log';
import type { Entity } from './data/models';
import { ALL_REPOSITORIES, Repository } from './data/repository';

@Component({
  selector: 'app-admin-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="shell">
      <header class="top">
        <a class="brand" routerLink="/admin">Pockai <span>Panel</span></a>
        <p class="tag demo">Datos de demostración · nada se envía al servidor</p>
        <div class="top__actions">
          <button class="btn btn--sm" type="button" (click)="resetDialog.showModal()">Restablecer datos</button>
          <button class="btn btn--sm btn--filled" type="button" (click)="logout()">Salir</button>
        </div>
      </header>

      <nav class="side" aria-label="Secciones del panel">
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
      <p>Se descartan todos los cambios hechos en este navegador y se vuelve a los datos de partida.</p>
      <form method="dialog" class="dialog__actions">
        <button class="btn" value="cancel" autofocus>Cancelar</button>
        <button class="btn btn--filled" value="reset">Restablecer</button>
      </form>
    </dialog>
  `,
  styles: `
    .shell {
      display: grid;
      grid-template: 'top top' auto 'side main' 1fr / 220px minmax(0, 1fr);
      min-block-size: 100dvh;
      background: var(--color-sky-wash);
    }
    .top {
      grid-area: top;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      padding: 12px 24px;
      border-block-end: var(--outline);
      background: var(--color-paper-white);
    }
    .brand {
      color: var(--color-carbon);
      font-family: var(--font-lateral);
      font-size: 28px;
      line-height: 1;
      text-decoration: none;
      text-transform: uppercase;
    }
    .brand span {
      font-family: var(--font-aeonik-pro);
      font-weight: var(--font-weight-bold);
      font-size: var(--text-caption);
      letter-spacing: 0.032em;
    }
    .demo {
      margin: 0;
      background: var(--color-sunburst);
      white-space: normal;
    }
    .top__actions {
      display: flex;
      gap: 8px;
      margin-inline-start: auto;
    }
    .side {
      grid-area: side;
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 24px 12px 24px 24px;
    }
    .side .btn {
      justify-content: start;
    }
    .side .is-active {
      background: var(--color-carbon);
      color: var(--color-paper-white);
    }
    .main {
      grid-area: main;
      min-inline-size: 0;
      padding: 24px;
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
    @media (width < 860px) {
      .shell {
        grid-template: 'top' auto 'side' auto 'main' 1fr / minmax(0, 1fr);
      }
      .side {
        flex-direction: row;
        overflow-x: auto;
        padding: 12px 16px;
      }
      .main {
        padding: 16px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  private readonly auth = inject(AdminAuth);
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

  protected logout() {
    this.auth.logout();
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
