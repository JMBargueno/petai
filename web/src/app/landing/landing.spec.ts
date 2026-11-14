import { TestBed } from '@angular/core/testing';
import { Landing } from './landing';
import { FAQ, FEATURES, SPECIES } from './content';

describe('Landing', () => {
  it('pinta el titular, las funciones y las especies del catálogo compartido', async () => {
    const fixture = TestBed.createComponent(Landing);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Pockai');
    expect(el.querySelectorAll('.feature').length).toBe(FEATURES.length);
    expect(el.querySelectorAll('.species__card').length).toBe(SPECIES.length);
    expect(el.querySelectorAll('details').length).toBe(FAQ.length);
  });

  it('no enlaza el panel de administración', async () => {
    const fixture = TestBed.createComponent(Landing);
    await fixture.whenStable();
    const hrefs = [...fixture.nativeElement.querySelectorAll('a')].map((a: HTMLAnchorElement) => a.getAttribute('href'));
    expect(hrefs.some((href) => href?.includes('admin'))).toBe(false);
  });
});
