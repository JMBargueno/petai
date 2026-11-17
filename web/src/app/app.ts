import { ChangeDetectionStrategy, Component, DOCUMENT, afterNextRender, computed, inject, signal } from '@angular/core';
import { PlatformLocation } from '@angular/common';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { ComingSoon } from './coming-soon/coming-soon';
import { shouldGate } from './coming-soon/gate';
import { UserAuth } from './shared/auth/user-auth';
import { isPlainClick, toRouterUrl } from './shared/navigation/internal-links';
import { SiteConfigService } from './shared/site-config/site-config';

/** Clase que pone el script de index.html para no enseñar la web un instante antes de taparla. */
const PENDING_CLASS = 'gate-pending';

/**
 * Raíz de la web. Además de la navegación interna, decide si se tapa la página con la landing
 * «Coming soon» (ajuste del panel): solo en el navegador, después de hidratar, para que el HTML
 * prerenderizado y el del cliente coincidan. El gate es de cliente: no protege el HTML estático.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ComingSoon],
  template: `
    <div class="page" [class.page--gated]="gated()" [attr.inert]="gated() ? '' : null">
      <router-outlet />
    </div>
    @if (gated()) {
      @defer (on immediate) {
        <app-coming-soon />
      }
    }
  `,
  styles: `
    .page {
      display: contents;
    }
    .page--gated {
      display: none;
    }
  `,
  host: { '(document:click)': 'onDocumentClick($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly router = inject(Router);
  private readonly doc = inject(DOCUMENT);
  private readonly base = inject(PlatformLocation).getBaseHrefFromDOM();
  private readonly site = inject(SiteConfigService);
  private readonly auth = inject(UserAuth);

  /** Ya se puede decidir (navegador, hidratado y con la configuración, cacheada o del servidor). */
  private readonly ready = signal(false);
  private readonly url = signal(this.router.url);

  protected readonly gated = computed(
    () =>
      this.ready() &&
      shouldGate({
        comingSoon: this.site.config().comingSoon.enabled,
        loggedIn: this.auth.loggedIn(),
        verified: this.auth.verified(),
        url: this.url(),
      }),
  );

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.url.set(e.urlAfterRedirects));

    afterNextRender(() => {
      this.url.set(this.router.url);
      const done = () => {
        this.ready.set(true);
        this.doc.documentElement.classList.remove(PENDING_CLASS);
      };
      const config = this.site.load();
      // Con copia local se decide ya; si no, se espera a la respuesta del servidor.
      if (this.site.hadCache) done();
      else void config.then(done);
      // La sesión guardada puede estar caducada o haber cambiado de estado (p. ej. verificada en la app).
      void this.auth.revalidate();
    });
  }

  /** Enlaces internos del mismo idioma: navegación del router en lugar de recargar la página. */
  protected onDocumentClick(event: MouseEvent) {
    const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!anchor || !isPlainClick(event, anchor)) return;

    // "#seccion": con <base href="/es/"> el navegador lo resolvería contra /es/ (la home).
    // Es un salto dentro de esta página: desplazar y, si se puede, mover el foco (skip link).
    const raw = anchor.getAttribute('href') ?? '';
    if (raw.startsWith('#')) {
      const target = raw.length > 1 ? this.doc.getElementById(decodeURIComponent(raw.slice(1))) : null;
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView();
      if (target.hasAttribute('tabindex')) target.focus({ preventScroll: true });
      const { pathname, search } = this.doc.location;
      this.doc.defaultView?.history.replaceState(this.doc.defaultView.history.state, '', `${pathname}${search}${raw}`);
      return;
    }

    const url = toRouterUrl(anchor.href, this.doc.location.origin, this.base);
    if (url === null) return;

    event.preventDefault();
    void this.router.navigateByUrl(url);
  }
}
