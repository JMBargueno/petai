import { ChangeDetectionStrategy, Component, DOCUMENT, LOCALE_ID, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { Marquee } from '../shared/ui/marquee';
import { Ribbon } from '../shared/ui/ribbon';
import { Sticker } from '../shared/ui/sticker';
import { SITE_URL } from '../site.config';
import { FAQ, FEATURES, MARQUEE, META, PLATFORMS, SPECIES } from './content';

const LOCALES = ['es', 'en'] as const;

@Component({
  selector: 'app-landing',
  imports: [Marquee, Ribbon, Sticker],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Landing {
  protected readonly locale = inject(LOCALE_ID).slice(0, 2);
  protected readonly marquee = MARQUEE;
  protected readonly features = FEATURES;
  protected readonly species = SPECIES;
  protected readonly platforms = PLATFORMS;
  protected readonly faq = FAQ;
  protected readonly year = new Date().getFullYear();

  constructor() {
    this.setHead(inject(Title), inject(Meta), inject(DOCUMENT));
  }

  /** Metadatos por idioma. Se ejecuta en el prerender, así que quedan en el HTML estático. */
  private setHead(title: Title, meta: Meta, doc: Document) {
    const url = `${SITE_URL}/${this.locale}/`;
    title.setTitle(META.title);
    meta.updateTag({ name: 'description', content: META.description });
    meta.updateTag({ property: 'og:title', content: META.title });
    meta.updateTag({ property: 'og:description', content: META.description });
    meta.updateTag({ property: 'og:type', content: 'website' });
    meta.updateTag({ property: 'og:url', content: url });

    // En el navegador estos nodos ya vienen en el HTML prerenderizado.
    if (doc.head.querySelector('link[rel="canonical"]')) return;

    const link = (rel: string, href: string, hreflang?: string) => {
      const el = doc.createElement('link');
      el.rel = rel;
      el.href = href;
      if (hreflang) el.hreflang = hreflang;
      doc.head.appendChild(el);
    };
    link('canonical', url);
    for (const l of LOCALES) link('alternate', `${SITE_URL}/${l}/`, l);
    link('alternate', `${SITE_URL}/es/`, 'x-default');

    const ld = doc.createElement('script');
    ld.type = 'application/ld+json';
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Pockai',
      applicationCategory: 'GameApplication',
      operatingSystem: 'Windows, Android',
      description: META.description,
      url,
    });
    doc.head.appendChild(ld);
  }
}
