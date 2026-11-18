import { NgTemplateOutlet } from '@angular/common';
import { UserAuth } from '../auth/user-auth';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

export interface NavLink {
  href: string;
  label: string;
  /** Solo en `pages`: la página en la que estamos. */
  current?: boolean;
}

/**
 * Cabecera común de la web pública (guía `navbar` de modern-web-guidance).
 *
 * Un único árbol de navegación: por defecto (y sin JS) la lista es un `popover` que abre el
 * botón "Menú"; cuando la fila completa cabe, el script añade `is-wide` y quita el atributo
 * `popover` para que la misma lista se muestre en línea. No hay breakpoint fijo: se mide.
 */
@Component({
  selector: 'app-site-header',
  template: `
    <a class="skip-link" href="#main" i18n="@@nav.skip">Saltar al contenido</a>
    <header #header class="site-header">
      <div #inner class="header-inner">
        <a class="logo" [href]="home()" [attr.aria-label]="homeLabel()">
          <img class="logo__mark" src="favicon.svg" alt="" aria-hidden="true" />
          <span class="logo__word" aria-hidden="true">Pockai</span>
        </a>

        <nav class="site-nav" [attr.aria-label]="navLabel()">
          <button
            class="menu-button btn btn--sm"
            type="button"
            popovertarget="site-menu"
            popovertargetaction="toggle"
            aria-controls="site-menu"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M4 7h16M4 12h16M4 17h10" />
            </svg>
            <span i18n="@@nav.menu">Menú</span>
          </button>

          <!-- Dos niveles: secciones de esta página (anclas) y páginas del sitio. -->
          <div #menu id="site-menu" class="site-menu" popover="auto" (click)="closeOnLink($event)">
            @if (links().length) {
              <p id="nav-sections" class="site-menu__label" i18n="@@nav.group.sections">En esta página</p>
              <ul class="site-menu__list" aria-labelledby="nav-sections">
                @for (link of links(); track link.href) {
                  <li><a class="site-menu__link" [href]="link.href">{{ link.label }}</a></li>
                }
              </ul>
            }
            @if (pages().length) {
              <p id="nav-pages" class="site-menu__label" i18n="@@nav.group.pages">Páginas</p>
              <ul class="site-menu__list site-menu__pages" aria-labelledby="nav-pages">
                @for (page of pages(); track page.href) {
                  <li>
                    <a
                      class="site-menu__link site-menu__page"
                      [href]="page.href"
                      [attr.aria-current]="page.current ? 'page' : null"
                    >
                      <span class="site-menu__page-dot" aria-hidden="true"></span>
                      {{ page.label }}
                    </a>
                  </li>
                }
              </ul>
            }
            <div class="site-menu__lang">
              <ng-container *ngTemplateOutlet="lang" />
            </div>
          </div>
        </nav>

        <div class="header-end">
          <span class="header-end__lang"><ng-container *ngTemplateOutlet="lang" /></span>
          <a
            class="contact-link btn btn--sm"
            [href]="'/' + locale() + '/contact'"
            [attr.aria-current]="contactCurrent() ? 'page' : null"
            aria-label="Contacto"
            i18n-aria-label="@@footer.contact"
            title="Contacto"
            i18n-title="@@footer.contact"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m4 7 8 6 8-6" />
            </svg>
          </a>
          @if (mounted()) {
            @if (auth.loggedIn()) {
              @if (auth.isAdmin()) {
                <!-- El panel solo existe en español (/es/admin). -->
                <a
                  class="icon-link btn btn--sm"
                  href="/es/admin/"
                  aria-label="Panel de administración"
                  i18n-aria-label="@@nav.admin"
                  title="Panel de administración"
                  i18n-title="@@nav.admin"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </a>
              }
              <a
                class="icon-link btn btn--sm"
                [href]="'/' + locale() + '/account'"
                [attr.aria-current]="accountCurrent() ? 'page' : null"
                aria-label="Tu cuenta"
                i18n-aria-label="@@nav.account"
                title="Tu cuenta"
                i18n-title="@@nav.account"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
                @if (!auth.verified()) {
                  <span class="icon-link__dot" aria-hidden="true"></span>
                }
              </a>
            } @else {
              <a class="login-link btn btn--sm" [href]="'/' + locale() + '/login'">
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
                <span class="login-link__text" i18n="@@nav.login">Entrar</span>
              </a>
            }
          }
          <a class="btn btn--filled btn--sm" [href]="cta().href">{{ cta().label }}</a>
        </div>
      </div>
    </header>

    <ng-template #lang>
      <span class="lang" role="group" aria-label="Idioma" i18n-aria-label="@@nav.lang">
        <a [href]="langHrefs().es" lang="es" hreflang="es" [attr.aria-current]="locale() === 'es' ? 'true' : null">ES</a>
        <a [href]="langHrefs().en" lang="en" hreflang="en" [attr.aria-current]="locale() === 'en' ? 'true' : null">EN</a>
      </span>
    </ng-template>
  `,
  styles: `
    :host {
      display: block;
      position: sticky;
      inset-block-start: 0;
      z-index: 20;
      margin-block-end: calc(-1 * var(--header-h)); /* flota sobre la primera banda */
      padding: 10px var(--gutter);
      pointer-events: none;
    }
    .site-header {
      view-transition-name: site-header; /* fija durante el fundido entre páginas */
      max-inline-size: var(--page-max-width);
      margin-inline: auto;
      pointer-events: auto;
    }
    .header-inner {
      display: flex;
      align-items: center;
      gap: 12px;
      min-block-size: calc(var(--header-h) - 20px);
      padding: 6px 6px 6px 14px;
      border: 1px solid var(--line-soft);
      border-radius: var(--radius-pills);
      background: var(--surface-glass);
      box-shadow: var(--shadow-2);
      backdrop-filter: saturate(1.6) blur(14px);
    }
    /* Mantener medible el ancho natural de la fila */
    .header-inner > * {
      flex-shrink: 0;
      white-space: nowrap;
    }
    .site-nav {
      margin-inline-start: auto;
    }
    .header-end {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* Contacto: botón cuadrado solo con el icono de correo (nombre accesible en aria-label). */
    .contact-link {
      inline-size: 36px;
      padding: 0;
    }
    /* En la propia página de contacto: resaltado como la página actual del menú. */
    .contact-link[aria-current='page'] {
      border-color: transparent;
      background: var(--ink);
      color: var(--bg);
    }
    /* Cuenta y panel: mismos botones cuadrados con icono. */
    .icon-link {
      position: relative;
      inline-size: 36px;
      padding: 0;
    }
    .icon-link[aria-current='page'] {
      border-color: transparent;
      background: var(--ink);
      color: var(--bg);
    }
    .icon-link svg {
      inline-size: 18px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .login-link svg {
      display: none;
      inline-size: 18px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
    }
    /* Móvil: «Entrar» se queda en icono y el correo de contacto (también en el pie) se oculta. */
    @media (width < 480px) {
      .contact-link {
        display: none;
      }
      .login-link {
        inline-size: 36px;
        padding: 0;
      }
      .login-link svg {
        display: block;
      }
      .login-link__text {
        position: absolute;
        inline-size: 1px;
        block-size: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
    }
    /* Aviso de correo sin verificar. */
    .icon-link__dot {
      position: absolute;
      inset: 2px 2px auto auto;
      inline-size: 9px;
      aspect-ratio: 1;
      border: 2px solid var(--surface);
      border-radius: 50%;
      background: var(--color-ember);
    }
    .contact-link svg {
      inline-size: 18px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .menu-button {
      anchor-name: --menu-button;
    }
    .menu-button svg {
      inline-size: 18px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
    }

    /* ── Estrecho: popover anclado al botón ── */
    .site-menu {
      position: fixed;
      inset: auto;
      inset-block-start: calc(var(--header-h) + 4px);
      inset-block-start: anchor(--menu-button bottom);
      inset-inline-end: var(--gutter);
      inline-size: min(86dvw, 22rem);
      max-block-size: calc(100dvh - 6rem);
      margin: 10px 0 0;
      padding: 10px;
      overflow: auto;
      border: var(--outline);
      border-radius: var(--radius-cards);
      background: var(--surface);
      color: var(--ink);
      box-shadow: var(--shadow-4);
      list-style: none;
    }
    .site-menu:is(:popover-open, .\\:popover-open) {
      display: grid;
      gap: 2px;
    }
    .site-menu__link {
      display: flex;
      align-items: center;
      min-block-size: 48px;
      padding: 0 14px;
      border-radius: 12px;
      color: var(--ink);
      font-weight: var(--font-weight-bold);
      font-size: 17px;
      text-decoration: none;
    }
    .site-menu__link:hover {
      background: var(--surface-2);
    }
    .site-menu__list {
      display: grid;
      gap: 2px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .site-menu__label {
      margin: 8px 14px 4px;
      color: var(--ink-muted);
      font-weight: var(--font-weight-bold);
      font-size: var(--text-caption);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .site-menu__pages {
      padding-block-start: 6px;
    }
    .site-menu__label + .site-menu__pages {
      padding-block-start: 0;
    }
    .site-menu__list + .site-menu__label {
      margin-block-start: 12px;
      padding-block-start: 12px;
      border-block-start: 1px solid var(--line-soft);
    }
    /* Página del sitio: punto de color y estado actual marcado (no solo por color). */
    .site-menu__page {
      gap: 10px;
    }
    .site-menu__page-dot {
      inline-size: 8px;
      aspect-ratio: 1;
      border-radius: 50%;
      background: var(--grad-accent);
    }
    .site-menu__page[aria-current='page'] {
      background: var(--ink);
      color: var(--bg);
    }
    .site-menu__page[aria-current='page'] .site-menu__page-dot {
      background: var(--color-sunburst);
    }
    .site-menu__lang {
      padding: 10px 6px 4px;
      border-block-start: 1px solid var(--line-soft);
      margin-block-start: 6px;
    }
    .header-end__lang {
      display: none;
    }

    @media (prefers-reduced-motion: no-preference) {
      .site-menu {
        opacity: 0;
        translate: 0 -6px;
        transition:
          opacity var(--dur-2) var(--ease-out),
          translate var(--dur-2) var(--ease-out),
          display var(--dur-2),
          overlay var(--dur-2);
        transition-behavior: allow-discrete;
      }
      .site-menu:is(:popover-open, .\\:popover-open) {
        opacity: 1;
        translate: 0 0;
      }
      @starting-style {
        .site-menu:is(:popover-open, .\\:popover-open) {
          opacity: 0;
          translate: 0 -6px;
        }
      }
    }

    /* ── Ancho: la misma lista en línea ── */
    .site-header.is-wide {
      .menu-button,
      .site-menu__lang {
        display: none;
      }
      .header-end__lang {
        display: inline-flex;
      }
      .site-menu {
        position: static;
        display: flex;
        align-items: center;
        gap: 2px;
        inline-size: auto;
        max-block-size: none;
        margin: 0;
        padding: 0;
        overflow: visible;
        border: 0;
        background: transparent;
        box-shadow: none;
        opacity: 1;
        translate: none;
      }
      .site-menu__label {
        /* En línea las etiquetas sobran visualmente, pero siguen nombrando cada lista. */
        position: absolute;
        inline-size: 1px;
        block-size: 1px;
        overflow: hidden;
        clip-path: inset(50%);
      }
      .site-menu__list {
        display: flex;
        align-items: center;
        gap: 2px;
      }
      /* Las páginas van aparte: separador vertical y botón contorneado. */
      .site-menu__list + .site-menu__label + .site-menu__pages {
        margin-inline-start: 10px;
        padding: 0 0 0 12px;
        border-inline-start: 1px solid var(--line-soft);
      }
      .site-menu__link {
        min-block-size: 40px;
        padding: 0 12px;
        border-radius: var(--radius-pills);
        font-size: 14px;
      }
      .site-menu__page {
        padding-inline: 12px 14px;
        box-shadow: inset 0 0 0 1px var(--line-soft);
      }
    }
    .is-measuring * {
      transition: none !important;
    }

    @media (width < 420px) {
      .logo__word {
        display: none;
      }
    }
  `,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteHeader {
  /** Anclas de la página actual. */
  readonly links = input<NavLink[]>([]);
  /** Otras páginas del sitio (Inicio, Mundo…), en un grupo aparte. */
  readonly pages = input<NavLink[]>([]);
  readonly cta = input.required<NavLink>();
  /** Estamos en /contact: el icono de correo se marca como página actual. */
  readonly contactCurrent = input(false);
  readonly home = input.required<string>();
  readonly homeLabel = input.required<string>();
  readonly navLabel = input.required<string>();
  readonly locale = input.required<string>();
  readonly langHrefs = input.required<{ es: string; en: string }>();

  /** Estamos en /account: el icono de cuenta se marca como página actual. */
  readonly accountCurrent = input(false);

  protected readonly auth = inject(UserAuth);
  /** La parte de la cuenta depende del navegador: no se prerenderiza (evita desajustes al hidratar). */
  protected readonly mounted = signal(false);

  private readonly header = viewChild.required<ElementRef<HTMLElement>>('header');
  private readonly inner = viewChild.required<ElementRef<HTMLElement>>('inner');
  private readonly menu = viewChild.required<ElementRef<HTMLElement>>('menu');

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.mounted.set(true);
      void this.auth.revalidate();
      const header = this.header().nativeElement;
      const inner = this.inner().nativeElement;
      const menu = this.menu().nativeElement;
      let lastWidth = 0;
      let wide = false;

      const measure = () => {
        const width = header.clientWidth;
        // Plegado: solo vuelve a medir si la cabecera ha crecido (evita parpadeos al encoger).
        if (!wide && width <= lastWidth) {
          lastWidth = width;
          return;
        }
        lastWidth = width;
        const wasOpen = menu.matches(':popover-open');
        header.classList.add('is-measuring', 'is-wide');
        // Sin caja (sin maquetar, p. ej. en tests) no se despliega: se queda el menú plegado.
        const fits = inner.clientWidth > 0 && inner.scrollWidth <= inner.clientWidth;
        header.classList.toggle('is-wide', fits);
        if (fits) {
          menu.removeAttribute('popover');
        } else if (!menu.hasAttribute('popover')) {
          menu.setAttribute('popover', 'auto');
          if (wasOpen) menu.showPopover();
        }
        wide = fits;
        requestAnimationFrame(() => header.classList.remove('is-measuring'));
      };

      lastWidth = -1;
      measure();
      if (typeof ResizeObserver === 'undefined') return;
      // Medir en el siguiente frame: cambiar el layout dentro del callback provoca el aviso de bucle.
      let frame = 0;
      const observer = new ResizeObserver(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(measure);
      });
      observer.observe(header);
      // El ancho de los enlaces cambia al cargar la tipografía: se vuelve a medir entonces
      // (observar la propia lista provocaba el aviso de bucle de ResizeObserver).
      void document.fonts?.ready.then(() => {
        lastWidth = -1;
        measure();
      });
      destroyRef.onDestroy(() => {
        cancelAnimationFrame(frame);
        observer.disconnect();
      });
    });
  }

  /** Al elegir un enlace en el menú plegado, se cierra. */
  protected closeOnLink(event: MouseEvent) {
    const menu = this.menu().nativeElement;
    if ((event.target as HTMLElement).closest('a') && menu.matches(':popover-open')) menu.hidePopover();
  }
}
