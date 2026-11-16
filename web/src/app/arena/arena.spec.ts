import { TestBed } from '@angular/core/testing';
import { Arena } from './arena';
import { SITE_URL } from '../site.config';

describe('Arena', () => {
  it('muestra la Arena a fondo en su propia página', async () => {
    const fixture = TestBed.createComponent(Arena);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelectorAll('h1').length).toBe(1);
    expect(el.querySelector('h1')?.textContent).toContain('Arena');
    expect(el.querySelector('#arena-a-fondo')).not.toBeNull();
    expect(el.querySelector('.site-menu__page[aria-current="page"]')?.getAttribute('href')).toBe('/es/arena');
  });

  it('deja canonical y migas de pan en el <head>', async () => {
    const fixture = TestBed.createComponent(Arena);
    await fixture.whenStable();

    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `${SITE_URL}/es/arena`,
    );
    const types = [...document.head.querySelectorAll('script[type="application/ld+json"]')].map(
      (s) => JSON.parse(s.textContent!)['@type'],
    );
    expect(types).toEqual(['WebPage', 'BreadcrumbList']);
  });
});
