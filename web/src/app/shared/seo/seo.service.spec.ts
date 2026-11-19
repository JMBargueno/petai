import { TestBed } from '@angular/core/testing';
import { SeoService } from './seo.service';
import { SITE_URL } from '../../site.config';

describe('SeoService', () => {
  const head = () => document.head;
  const canonical = () => head().querySelectorAll('link[rel="canonical"]');

  it('actualiza el canonical en cada navegación en lugar de duplicarlo', () => {
    const seo = TestBed.inject(SeoService);
    seo.set({ title: 'Inicio', description: 'Descripción', path: '' });
    seo.set({ title: 'Lore', description: 'Descripción', path: 'lore' });

    expect(canonical().length).toBe(1);
    expect(canonical()[0].getAttribute('href')).toBe(`${SITE_URL}/es/lore`);
  });

  it('escribe hreflang de todos los idiomas más x-default', () => {
    TestBed.inject(SeoService).set({ title: 't', description: 'd', path: 'lore' });
    const alternates = [...head().querySelectorAll('link[rel="alternate"][hreflang]')].map((l) => [
      l.getAttribute('hreflang'),
      l.getAttribute('href'),
    ]);
    expect(alternates).toEqual([
      ['es', `${SITE_URL}/es/lore`],
      ['en', `${SITE_URL}/en/lore`],
      ['x-default', `${SITE_URL}/es/lore`],
    ]);
  });

  it('reemplaza los bloques JSON-LD y escapa "<"', () => {
    const seo = TestBed.inject(SeoService);
    seo.set({ title: 't', description: 'd', path: '', jsonLd: [{ a: 1 }, { b: 2 }] });
    seo.set({ title: 't', description: 'd', path: '', jsonLd: [{ name: '</script>' }] });

    const blocks = head().querySelectorAll('script[type="application/ld+json"]');
    expect(blocks.length).toBe(1);
    expect(blocks[0].textContent).not.toContain('</script>');
    expect(JSON.parse(blocks[0].textContent!).name).toBe('</script>');
  });

  it('con noindex quita canonical y hreflang', () => {
    const seo = TestBed.inject(SeoService);
    seo.set({ title: 't', description: 'd', path: '' });
    seo.set({ title: 't', description: 'd', path: '404', noindex: true });

    expect(canonical().length).toBe(0);
    expect(head().querySelectorAll('link[rel="alternate"][hreflang]').length).toBe(0);
    expect(head().querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, follow');
  });

  it('rellena Open Graph y Twitter con la imagen por defecto', () => {
    TestBed.inject(SeoService).set({ title: 'Título', description: 'd', path: '' });
    const prop = (p: string) => head().querySelector(`meta[property="${p}"]`)?.getAttribute('content');
    expect(prop('og:image')).toBe(`${SITE_URL}/og/home-v2.png`);
    expect(prop('og:locale')).toBe('es_ES');
    expect(prop('og:locale:alternate')).toBe('en_US');
    expect(head().querySelector('meta[name="twitter:card"]')?.getAttribute('content')).toBe('summary_large_image');
    expect(head().querySelector('meta[name="twitter:site"]')?.getAttribute('content')).toBe('@pockais');
  });
});
