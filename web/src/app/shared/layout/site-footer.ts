import { ChangeDetectionStrategy, Component, LOCALE_ID, inject } from '@angular/core';

/** Pie común de la web pública: mapa del sitio, idioma y marca. */
@Component({
  selector: 'app-site-footer',
  template: `
    <footer class="footer band band--ink">
      <div class="band__inner footer__inner">
        <div class="footer__brand">
          <a class="logo" [href]="home" aria-label="Pockai, inicio" i18n-aria-label="@@nav.home">
            <span class="logo__mark" aria-hidden="true">P</span>
            <span aria-hidden="true">Pockai</span>
          </a>
          <p class="footer__tagline" i18n="@@footer.tagline">
            Tu yokai de bolsillo con IA. Eclosiona, cuida, combate y conversa, en el escritorio y en el móvil.
          </p>
          <a class="btn btn--filled" [href]="home + '#descargar'" i18n="@@hero.cta.primary">Descargar Pockai</a>
        </div>

        <nav class="footer__cols" aria-label="Mapa del sitio" i18n-aria-label="@@footer.nav">
          <div>
            <p class="footer__head" i18n="@@footer.explore">Explora</p>
            <ul>
              <li><a [href]="home + '#funciones'" i18n="@@nav.features">Funciones</a></li>
              <li><a [href]="home + 'arena'" i18n="@@nav.arena">Arena</a></li>
              <li><a [href]="home + 'pockais'" i18n="@@nav.species">Pockais</a></li>
              <li><a [href]="home + '#demo'" i18n="@@nav.demo">Pruébalo</a></li>
              <li><a [href]="home + '#precios'" i18n="@@nav.pricing">Precios</a></li>
              <li><a [href]="home + '#faq'">FAQ</a></li>
            </ul>
          </div>
          <div>
            <p class="footer__head" i18n="@@nav.lore">Mundo</p>
            <ul>
              <li><a [href]="lore" i18n="@@footer.lore">El Éter Digital · el lore de Pockai</a></li>
              <li><a [href]="lore + '#elementos'" i18n="@@lore.nav.elem">Elementos</a></li>
              <li><a [href]="lore + '#coliseo'" i18n="@@lore.nav.colo">Coliseo</a></li>
            </ul>
          </div>
          <div>
            <p class="footer__head" i18n="@@nav.lang">Idioma</p>
            <ul>
              <li><a href="/es/" lang="es" hreflang="es">Español</a></li>
              <li><a href="/en/" lang="en" hreflang="en">English</a></li>
            </ul>
          </div>
        </nav>

        <p class="display footer__mark" aria-hidden="true">Pockai</p>

        <div class="footer__legal">
          <p>© {{ year }} Pockai. <span i18n="@@footer.rights">Todos los derechos reservados.</span></p>
          <p class="label-caps">Pocket + Yokai + AI</p>
        </div>
      </div>
    </footer>
  `,
  styles: `
    :host {
      display: block;
    }
    .footer {
      padding-block: clamp(64px, 8vw, 112px) 32px;
    }
    .footer__inner {
      display: grid;
      gap: clamp(40px, 6vw, 72px) 48px;
      grid-template-columns: minmax(0, 1fr);
    }
    @media (width >= 960px) {
      .footer__inner {
        grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
      }
      .footer__mark,
      .footer__legal {
        grid-column: 1 / -1;
      }
    }
    .footer__brand {
      display: grid;
      gap: 20px;
      justify-items: start;
      align-content: start;
    }
    .footer__tagline {
      margin: 0;
      max-inline-size: 36ch;
      color: var(--ink-muted);
      font-size: 17px;
    }
    .footer__cols {
      display: grid;
      gap: 32px;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    }
    .footer__head {
      margin: 0 0 14px;
      color: var(--ink-muted);
      font-weight: var(--font-weight-bold);
      font-size: var(--text-caption);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    ul {
      display: grid;
      gap: 4px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li a {
      display: inline-flex;
      align-items: center;
      min-block-size: 36px;
      color: var(--ink);
      text-decoration: none;
      text-underline-offset: 4px;
    }
    li a:hover {
      text-decoration: underline;
    }
    .footer__mark {
      margin: 0;
      font-size: clamp(72px, 21vw, 300px);
      line-height: 0.8;
      text-align: center;
      background: linear-gradient(180deg, #b3a8ff 0%, #4da2ff 60%, rgb(77 162 255 / 0.1) 100%);
      background-clip: text;
      color: transparent;
      user-select: none;
    }
    .footer__legal {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 12px;
      padding-block-start: 20px;
      border-block-start: 1px solid var(--line-soft);
      color: var(--ink-muted);
      font-size: 14px;
    }
    .footer__legal p {
      margin: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteFooter {
  private readonly locale = inject(LOCALE_ID).slice(0, 2);
  protected readonly home = `/${this.locale}/`;
  protected readonly lore = `/${this.locale}/lore`;
  protected readonly year = new Date().getFullYear();
}
