import { TestBed } from '@angular/core/testing';
import { Pockais } from './pockais';
import { SPECIES } from '../landing/content';

describe('Pockais', () => {
  it('reúne especies, rarezas y patrones bajo un único h1', async () => {
    const fixture = TestBed.createComponent(Pockais);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelectorAll('h1').length).toBe(1);
    expect(el.querySelector('h1')?.textContent).toContain('pockais');
    expect(el.querySelectorAll('.species__card').length).toBe(SPECIES.length);
    expect(el.querySelector('#rarezas .batch')).not.toBeNull();
    expect(el.querySelector('.site-menu__page[aria-current="page"]')?.getAttribute('href')).toBe('/es/pockais');
  });

  it('deja canonical y migas de pan en el <head>', async () => {
    const fixture = TestBed.createComponent(Pockais);
    await fixture.whenStable();

    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://pockai.example/es/pockais',
    );
    const types = [...document.head.querySelectorAll('script[type="application/ld+json"]')].map(
      (s) => JSON.parse(s.textContent!)['@type'],
    );
    expect(types).toEqual(['WebPage', 'BreadcrumbList']);
  });
});
