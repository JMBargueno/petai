import { ChangeDetectionStrategy, Component, DOCUMENT, inject } from '@angular/core';
import { PlatformLocation } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';
import { isPlainClick, toRouterUrl } from './shared/navigation/internal-links';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
  host: { '(document:click)': 'onDocumentClick($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly router = inject(Router);
  private readonly doc = inject(DOCUMENT);
  private readonly base = inject(PlatformLocation).getBaseHrefFromDOM();

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
