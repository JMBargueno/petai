import { TestBed } from '@angular/core/testing';
import { Landing } from './landing';
import { FAQ, FEATURES } from './content';
import { SITE_URL } from '../site.config';

describe('Landing', () => {
  it('pinta el titular, las funciones y las especies del catálogo compartido', async () => {
    const fixture = TestBed.createComponent(Landing);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    const h1 = el.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim();
    expect(h1).toContain('Pockai');
    expect(h1).toContain('Tu yokai de bolsillo');
    expect(el.querySelectorAll('h1').length).toBe(1);
    expect(el.querySelectorAll('.feature').length).toBe(FEATURES.length);
    expect(el.querySelectorAll('details').length).toBe(FAQ.length);
  });

  it('usa la cabecera y el pie comunes, con salto al contenido', async () => {
    const fixture = TestBed.createComponent(Landing);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('app-site-header .skip-link')?.getAttribute('href')).toBe('#main');
    expect(el.querySelector('main#main')).not.toBeNull();
    expect(el.querySelector('app-site-footer footer')).not.toBeNull();
  });

  it('es una home corta: 7 bandas y sin especies, rarezas ni Arena', async () => {
    const fixture = TestBed.createComponent(Landing);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelectorAll('main .band').length).toBe(7);
    expect(el.querySelector('.species__card, #rarezas, #arena-a-fondo')).toBeNull();
    const links = [...el.querySelectorAll('.feature__link')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/es/pockais', '/es/arena', '/es/lore#despertar']);
    const pages = [...el.querySelectorAll('.site-menu__page')].map((a) => a.getAttribute('href'));
    expect(pages).toEqual(['/es/', '/es/pockais', '/es/arena', '/es/lore']);
  });

  it('el FAQ remite al formulario de contacto', async () => {
    const fixture = TestBed.createComponent(Landing);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('#faq .faq__contact a')?.getAttribute('href')).toBe('/es/contact');
  });

  it('no enlaza el panel de administración', async () => {
    const fixture = TestBed.createComponent(Landing);
    await fixture.whenStable();
    const hrefs = [...fixture.nativeElement.querySelectorAll('a')].map((a: HTMLAnchorElement) => a.getAttribute('href'));
    expect(hrefs.some((href) => href?.includes('admin'))).toBe(false);
  });

  it('guía al lore desde hero, especies y footer', async () => {
    const fixture = TestBed.createComponent(Landing);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('.hero__lore')?.getAttribute('href')).toBe('/es/lore');
    expect(el.querySelector('.hero__lore')?.textContent).toContain('Éter Digital');
    const footerHrefs = [...el.querySelectorAll('app-site-footer a')].map((a) => a.getAttribute('href'));
    expect(footerHrefs).toContain('/es/lore');
  });

  it('deja en el <head> canonical, hreflang con x-default y JSON-LD válido', async () => {
    const fixture = TestBed.createComponent(Landing);
    await fixture.whenStable();
    const head = document.head;

    expect(head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`${SITE_URL}/es/`);
    const langs = [...head.querySelectorAll('link[rel="alternate"][hreflang]')].map((l) => l.getAttribute('hreflang'));
    expect(langs).toEqual(['es', 'en', 'x-default']);
    expect(head.querySelector('meta[name="twitter:card"]')?.getAttribute('content')).toBe('summary_large_image');

    const blocks = [...head.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent!));
    const types = blocks.flatMap((b) => (b['@graph'] ?? [b]).map((n: { '@type': string }) => n['@type']));
    expect(types).toEqual(expect.arrayContaining(['Organization', 'WebSite', 'SoftwareApplication', 'FAQPage']));
  });
});
