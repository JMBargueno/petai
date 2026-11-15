import { ChangeDetectionStrategy, Component, DOCUMENT, LOCALE_ID, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { Marquee } from '../shared/ui/marquee';
import { Ribbon } from '../shared/ui/ribbon';
import { Sticker } from '../shared/ui/sticker';
import { SITE_URL } from '../site.config';
import { MARQUEE, META } from './content';
import { Origin } from './sections/origin';
import { PromiseSection } from './sections/promise';
import { Appearance } from './sections/appearance';
import { Elements } from './sections/elements';
import { Awakening } from './sections/awakening';
import { LifeCycle } from './sections/life-cycle';
import { Colosseum } from './sections/colosseum';
import { Glossary } from './sections/glossary';

const LOCALES = ['es', 'en'] as const;

@Component({
  selector: 'app-lore',
  imports: [Marquee, Ribbon, Sticker, Origin, PromiseSection, Appearance, Elements, Awakening, LifeCycle, Colosseum, Glossary],
  template: `
    <app-marquee [text]="marquee" />

    <header class="nav">
      <a class="logo" [href]="home" aria-label i18n-aria-label="@@lore.nav.home">P</a>

      <nav class="nav__links" aria-label i18n-aria-label="@@lore.nav.label">
        <a class="btn btn--sm" href="#origen" i18n="@@lore.nav.origin">Origen</a>
        <a class="btn btn--sm" href="#rarezas" i18n="@@lore.nav.rare">Rarezas</a>
        <a class="btn btn--sm" href="#apariencia" i18n="@@lore.nav.appear">Apariencia</a>
        <a class="btn btn--sm" href="#elementos" i18n="@@lore.nav.elem">Elementos</a>
        <a class="btn btn--sm" href="#despertar" i18n="@@lore.nav.awake">Despertar</a>
        <a class="btn btn--sm" href="#ciclo" i18n="@@lore.nav.life">Ciclo</a>
        <a class="btn btn--sm" href="#coliseo" i18n="@@lore.nav.colo">Coliseo</a>
      </nav>

      <div class="nav__end">
        <div class="lang" role="group" aria-label i18n-aria-label="@@nav.lang">
          <a href="/es/lore" lang="es" hreflang="es" [attr.aria-current]="locale === 'es' ? 'true' : null">ES</a>
          <a href="/en/lore" lang="en" hreflang="en" [attr.aria-current]="locale === 'en' ? 'true' : null">EN</a>
        </div>
        <a class="btn btn--filled btn--sm" [href]="home" i18n="@@lore.nav.back">Landing</a>
      </div>
    </header>

    <main>
      <section id="top" class="band band--sky lore-hero">
        <app-ribbon shape="wave" draw="load" />
        <app-sticker class="lore-hero__spot float" icon="egg" color="sunburst" [rotate]="-10" [size]="112" />
        <app-sticker class="lore-hero__spot float" icon="star" color="lavender" [rotate]="9" [size]="88" />
        <app-sticker class="lore-hero__spot float" icon="moon" color="voltage-violet" [rotate]="14" [size]="80" />

        <div class="band__inner lore-hero__inner">
          <h1 class="display section-title reveal" i18n="@@lore.hero.title">
            El Éter <span class="hl">Digital</span>
          </h1>
          <p class="lead lead--center reveal" i18n="@@lore.hero.lead">
            De la fricción entre la vida humana y el océano de datos, nace un mundo. Y de sus profundidades, emergen los pockai.
          </p>
          <a class="btn btn--filled reveal" href="#origen" i18n="@@lore.hero.cta">Descender al Éter</a>
        </div>
      </section>

      <app-origin />
      <app-promise-section />
      <app-appearance />
      <app-elements />
      <app-awakening />
      <app-life-cycle />
      <app-colosseum />
      <app-glossary />

      <section id="cta" class="band band--sky lore-cta">
        <app-sticker class="lore-cta__egg float" icon="egg" color="sunburst" [rotate]="-8" [size]="96" />
        <div class="band__inner lore-cta__inner reveal">
          <p class="lead lore-cta__sub" i18n="@@lore.cta.sub">El lore se vive, no se lee.</p>
          <a class="btn btn--filled" [href]="download" i18n="@@lore.cta">Descargar Pockai</a>
        </div>
      </section>
    </main>
  `,
  styleUrl: './lore.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Lore {
  protected readonly locale = inject(LOCALE_ID).slice(0, 2);
  protected readonly marquee = MARQUEE;
  protected readonly home = `/${this.locale}/`;
  protected readonly download = `/${this.locale}/#descargar`;

  constructor() {
    this.setHead(inject(Title), inject(Meta), inject(DOCUMENT));
  }

  /** Metadatos por idioma; en el prerender quedan en el HTML estático de /lore. */
  private setHead(title: Title, meta: Meta, doc: Document) {
    const url = `${SITE_URL}/${this.locale}/lore`;
    title.setTitle(META.title);
    meta.updateTag({ name: 'description', content: META.description });
    meta.updateTag({ property: 'og:title', content: META.title });
    meta.updateTag({ property: 'og:description', content: META.description });
    meta.updateTag({ property: 'og:type', content: 'website' });
    meta.updateTag({ property: 'og:url', content: url });

    if (doc.head.querySelector('link[rel="canonical"]')) return;

    const link = (rel: string, href: string, hreflang?: string) => {
      const el = doc.createElement('link');
      el.rel = rel;
      el.href = href;
      if (hreflang) el.hreflang = hreflang;
      doc.head.appendChild(el);
    };
    link('canonical', url);
    for (const l of LOCALES) link('alternate', `${SITE_URL}/${l}/lore`, l);
  }
}
