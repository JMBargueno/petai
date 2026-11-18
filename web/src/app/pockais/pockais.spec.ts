import { TestBed } from '@angular/core/testing';
import { Pockais } from './pockais';
import { STARTER_SPECIES } from '../landing/content';
import { SITE_URL } from '../site.config';

describe('Pockais', () => {
  it('reúne especies iniciales, evolución, rarezas y patrones bajo un único h1', async () => {
    const fixture = TestBed.createComponent(Pockais);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelectorAll('h1').length).toBe(1);
    expect(el.querySelector('h1')?.textContent).toContain('pockais');
    expect(el.querySelectorAll('.species__card').length).toBe(STARTER_SPECIES.length);
    expect(STARTER_SPECIES.every((s) => s.rarityId === 'normal')).toBe(true);
    expect(el.querySelectorAll('#evolucion .picker__opt').length).toBe(STARTER_SPECIES.length);
    expect(el.querySelectorAll('#evolucion .steps__btn').length).toBe(5);
    expect(el.querySelector('#rarezas .batch')).not.toBeNull();
    expect(el.querySelector('.site-menu__page[aria-current="page"]')?.getAttribute('href')).toBe('/es/pockais');
  });

  it('deja canonical y migas de pan en el <head>', async () => {
    const fixture = TestBed.createComponent(Pockais);
    await fixture.whenStable();

    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `${SITE_URL}/es/pockais`,
    );
    const types = [...document.head.querySelectorAll('script[type="application/ld+json"]')].map(
      (s) => JSON.parse(s.textContent!)['@type'],
    );
    expect(types).toEqual(['WebPage', 'BreadcrumbList']);
  });
});
