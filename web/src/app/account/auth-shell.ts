import { ChangeDetectionStrategy, Component, LOCALE_ID, inject, input } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { navPages } from '../shared/layout/nav-pages';
import { NavLink, SiteHeader } from '../shared/layout/site-header';
import { SiteFooter } from '../shared/layout/site-footer';
import { Sticker } from '../shared/ui/sticker';

/**
 * Marco común de las páginas de cuenta (/login, /register, /forgot-password, /account):
 * cabecera, tarjeta centrada y pie. Son páginas solo de cliente y fuera de buscadores.
 */
@Component({
  selector: 'app-auth-shell',
  imports: [SiteHeader, SiteFooter, Sticker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-site-header
      [pages]="pages"
      [cta]="cta"
      [home]="home"
      [homeLabel]="homeLabel"
      [navLabel]="navLabel"
      [locale]="locale"
      [langHrefs]="{ es: '/es/' + path(), en: '/en/' + path() }"
    />

    <main id="main" tabindex="-1" class="band band--hero band--first shell">
      <app-sticker class="spot spot--a" icon="egg" color="sunburst" [size]="76" [rotate]="-12" />
      <app-sticker class="spot spot--b" icon="heart" color="mint-pop" [size]="60" [rotate]="10" />
      <div class="band__inner shell__inner">
        <div class="shell__card card--pop">
          <ng-content />
        </div>
      </div>
    </main>

    <app-site-footer />
  `,
  styles: `
    main:focus {
      outline: none;
    }
    .shell {
      position: relative;
      display: grid;
      place-items: center;
      min-block-size: min(820px, 92svh);
    }
    .spot {
      position: absolute;
      box-shadow: var(--shadow-pop);
    }
    .spot--a {
      inset: 18% auto auto 8%;
    }
    .spot--b {
      inset: auto 10% 14% auto;
    }
    @media (width < 760px) {
      .spot {
        display: none;
      }
    }
    .shell__inner {
      display: grid;
      place-items: center;
    }
    .shell__card {
      display: grid;
      gap: 18px;
      inline-size: min(100%, 480px);
      padding: clamp(22px, 5vw, 44px);
      border: var(--outline);
      border-radius: var(--radius-cards-elevated);
      background: var(--surface);
    }
  `,
})
export class AuthShell {
  /** Ruta de la página sin idioma (p. ej. `login`), para el cambio de idioma. */
  readonly path = input.required<string>();

  protected readonly locale = inject(LOCALE_ID).slice(0, 2);
  protected readonly home = `/${this.locale}/`;
  protected readonly pages = navPages(this.locale);
  protected readonly cta: NavLink = { href: `${this.home}#descargar`, label: $localize`:@@nav.cta:Descargar` };
  protected readonly homeLabel = $localize`:@@nav.home:Pockai, inicio`;
  protected readonly navLabel = $localize`:@@nav.label:Principal`;

  constructor() {
    const meta = inject(Meta);
    meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    meta.updateTag({ name: 'referrer', content: 'no-referrer' });
  }
}

/** Título de la pestaña de las páginas de cuenta. */
export function setAuthTitle(title: Title, text: string) {
  title.setTitle(`${text} · Pockai`);
}

/**
 * Destino tras entrar o registrarse (`?next=`): solo rutas internas del idioma actual
 * (empiezan por "/" pero no por "//"), para no abrir redirecciones a otros sitios.
 */
export function safeNext(next: string | null | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback;
  return next;
}

/** Estilos comunes de los formularios de cuenta. */
export const AUTH_FORM_STYLES = `
  :host {
    display: contents;
  }
  h1 {
    margin: 0;
    font-size: clamp(32px, 5vw, 48px);
  }
  .eyebrow,
  .lead {
    margin: 0;
  }
  form {
    display: grid;
    gap: 16px;
  }
  .field {
    display: grid;
    gap: 6px;
  }
  .field__hint {
    margin: 0;
    color: var(--ink-muted);
    font-size: var(--text-caption);
  }
  .field__hint--ok {
    color: color-mix(in srgb, var(--color-mint-pop) 60%, var(--ink));
    font-weight: var(--font-weight-bold);
  }
  .field__hint--bad {
    color: var(--color-ember);
    font-weight: var(--font-weight-bold);
  }
  .form-error,
  .form-ok {
    margin: 0;
    padding: 8px 14px;
    border: 2px solid var(--color-ember);
    border-radius: var(--radius-2xl);
    font-weight: var(--font-weight-bold);
  }
  .form-ok {
    border-color: var(--color-mint-pop);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 16px;
  }
  .actions .btn--filled {
    flex: 1 1 auto;
  }
  .alt {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 6px;
    margin: 0;
    color: var(--ink-muted);
  }
  .alt a {
    color: var(--accent-ink);
    font-weight: var(--font-weight-bold);
  }
  .code-input {
    font-size: 24px;
    letter-spacing: 0.4em;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
`;
