import { ChangeDetectionStrategy, Component, LOCALE_ID, inject } from '@angular/core';
import { navPages } from '../shared/layout/nav-pages';
import { NavLink, SiteHeader } from '../shared/layout/site-header';
import { SiteFooter } from '../shared/layout/site-footer';
import { Sticker } from '../shared/ui/sticker';

@Component({
  selector: 'app-pro-success',
  imports: [SiteHeader, SiteFooter, Sticker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-site-header
      [pages]="navPages"
      [cta]="navCta"
      [home]="homeUrl"
      [homeLabel]="homeLabel"
      [navLabel]="navLabel"
      [locale]="locale"
      [langHrefs]="{ es: '/es/pro/ok', en: '/en/pro/ok' }"
    />

    <main id="main" tabindex="-1" class="band band--hero band--first pro-status-page">
      <app-sticker class="spot spot--a" icon="star" color="sunburst" [size]="72" [rotate]="-12" />
      <app-sticker class="spot spot--b" icon="heart" color="ember" [size]="60" [rotate]="10" />

      <div class="band__inner pro-status">
        <div class="status-badge">⭐ Pockai Pro</div>
        <h1 class="display title">¡Ya eres Pockai Pro!</h1>
        <p class="lead text">
          Tu suscripción se ha activado correctamente. Ya puedes disfrutar de hasta 200 mensajes diarios con IA de alta calidad,
          memoria expandida y herramientas de agente desbloqueadas.
        </p>

        <div class="actions">
          <a class="btn btn--filled" href="petai://pro-success">Abrir en la app de escritorio</a>
          <a class="btn" [href]="homeUrl">Volver al inicio</a>
        </div>
      </div>
    </main>

    <app-site-footer />
  `,
  styles: `
    .pro-status-page {
      min-block-size: min(860px, 100svh);
      display: grid;
      place-items: center;
      position: relative;
      text-align: center;
      padding: 60px 20px;
    }
    .status-badge {
      display: inline-block;
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.3);
      color: #818cf8;
      padding: 6px 16px;
      border-radius: 9999px;
      font-weight: 600;
      font-size: 0.9rem;
      margin-bottom: 16px;
    }
    .title {
      font-size: clamp(2rem, 5vw, 3rem);
      margin-bottom: 16px;
    }
    .text {
      max-width: 580px;
      margin: 0 auto 32px;
      line-height: 1.6;
    }
    .actions {
      display: flex;
      gap: 16px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 12px 24px;
      border-radius: 9999px;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s;
    }
    .btn--filled {
      background: #6366f1;
      color: white;
    }
    .btn--filled:hover {
      background: #4f46e5;
    }
  `,
})
export class ProSuccess {
  readonly locale = inject(LOCALE_ID);
  readonly homeUrl = `/${this.locale}/`;
  readonly homeLabel = 'Inicio';
  readonly navLabel = 'Navegación principal';
  readonly navPages = navPages(this.locale);
  readonly navCta: NavLink = {
    label: 'Descargar',
    href: `${this.homeUrl}#descargas`,
  };
}
