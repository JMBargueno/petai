import { TestBed } from '@angular/core/testing';
import { Lore } from './lore';
import { SITE_URL } from '../site.config';

describe('Lore', () => {
  it('pinta el hero, el índice con los 10 anclajes y el selector de idioma', async () => {
    const fixture = TestBed.createComponent(Lore);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('El Éter Digital');
    expect(el.querySelectorAll('.toc a').length).toBe(10);
    const hrefs = [...el.querySelectorAll('a')].map((a: HTMLAnchorElement) => a.getAttribute('href'));
    expect(hrefs).toContain('/es/lore');
    expect(hrefs).toContain('/en/lore');
  });

  it('tiene pie y JSON-LD de artículo con migas de pan', async () => {
    const fixture = TestBed.createComponent(Lore);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('app-site-footer footer')).not.toBeNull();
    const types = [...document.head.querySelectorAll('script[type="application/ld+json"]')].map(
      (s) => JSON.parse(s.textContent!)['@type'],
    );
    expect(types).toEqual(['Article', 'BreadcrumbList']);
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `${SITE_URL}/es/lore`,
    );
  });
});
