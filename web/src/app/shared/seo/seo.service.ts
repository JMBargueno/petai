import { DOCUMENT, Injectable, LOCALE_ID, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { LOCALES, OG_IMAGE, SITE_NAME, SITE_URL, pageUrl } from '../../site.config';
import { SOCIAL_HANDLE } from '../social';

export interface SeoConfig {
  /** 30–60 caracteres (checklist seo-page). */
  title: string;
  /** 120–160 caracteres. */
  description: string;
  /** Ruta sin idioma: '' para la home, 'lore'… */
  path: string;
  /** Ruta pública de la imagen social (1200×630). Por defecto la OG de la home. */
  image?: string;
  imageAlt?: string;
  type?: 'website' | 'article';
  /** Bloques JSON-LD; se reemplazan en cada llamada. */
  jsonLd?: object[];
  /** Páginas que no deben indexarse (404, panel). Quita canonical y hreflang. */
  noindex?: boolean;
}

const OG_LOCALE: Record<string, string> = { es: 'es_ES', en: 'en_US' };

/**
 * Único punto que escribe el <head>. Se llama desde el constructor de cada página: en el
 * prerender deja todo en el HTML estático y en la navegación de cliente actualiza los nodos
 * existentes (no se quedan canonicals ni JSON-LD de la página anterior).
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly doc = inject(DOCUMENT);
  readonly locale = inject(LOCALE_ID).slice(0, 2);

  set(config: SeoConfig) {
    const url = pageUrl(this.locale, config.path);
    const image = `${SITE_URL}/${config.image ?? OG_IMAGE()}`;
    const imageAlt = config.imageAlt ?? config.title;

    this.title.setTitle(config.title);
    this.name('description', config.description);
    this.name('robots', config.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large');

    this.property('og:site_name', SITE_NAME);
    this.property('og:title', config.title);
    this.property('og:description', config.description);
    this.property('og:type', config.type ?? 'website');
    this.property('og:url', url);
    this.property('og:image', image);
    this.property('og:image:width', '1200');
    this.property('og:image:height', '630');
    this.property('og:image:alt', imageAlt);
    this.property('og:locale', OG_LOCALE[this.locale] ?? 'es_ES');
    this.meta.removeTag('property="og:locale:alternate"');
    for (const l of LOCALES) {
      if (l !== this.locale) this.meta.addTag({ property: 'og:locale:alternate', content: OG_LOCALE[l] });
    }

    this.name('twitter:card', 'summary_large_image');
    this.name('twitter:site', `@${SOCIAL_HANDLE}`);
    this.name('twitter:title', config.title);
    this.name('twitter:description', config.description);
    this.name('twitter:image', image);
    this.name('twitter:image:alt', imageAlt);

    this.setLinks(config);
    this.setJsonLd(config.jsonLd ?? []);
  }

  private name(name: string, content: string) {
    this.meta.updateTag({ name, content });
  }
  private property(property: string, content: string) {
    this.meta.updateTag({ property, content });
  }

  private setLinks(config: SeoConfig) {
    const head = this.doc.head;
    head.querySelectorAll('link[rel="canonical"], link[rel="alternate"][hreflang]').forEach((el) => el.remove());
    if (config.noindex) return;

    const add = (rel: string, href: string, hreflang?: string) => {
      const el = this.doc.createElement('link');
      el.setAttribute('rel', rel);
      el.setAttribute('href', href);
      if (hreflang) el.setAttribute('hreflang', hreflang);
      head.appendChild(el);
    };
    add('canonical', pageUrl(this.locale, config.path));
    for (const l of LOCALES) add('alternate', pageUrl(l, config.path), l);
    add('alternate', pageUrl(LOCALES[0], config.path), 'x-default');
  }

  private setJsonLd(blocks: object[]) {
    const head = this.doc.head;
    head.querySelectorAll('script[type="application/ld+json"][data-seo]').forEach((el) => el.remove());
    for (const block of blocks) {
      const el = this.doc.createElement('script');
      el.setAttribute('type', 'application/ld+json');
      el.setAttribute('data-seo', '');
      // `<` escapado para que ningún texto pueda cerrar el <script>.
      el.textContent = JSON.stringify(block).replace(/</g, '\\u003c');
      head.appendChild(el);
    }
  }
}
