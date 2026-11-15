import { TestBed } from '@angular/core/testing';
import { Lore } from './lore';

describe('Lore', () => {
  it('pinta el hero, la nav con los 7 anclajes y el toggle de idioma', async () => {
    const fixture = TestBed.createComponent(Lore);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('h1')?.textContent?.trim()).toBe('El Éter Digital');
    expect(el.querySelectorAll('.nav__links a').length).toBe(7);
    const hrefs = [...el.querySelectorAll('a')].map((a: HTMLAnchorElement) => a.getAttribute('href'));
    expect(hrefs).toContain('/es/lore');
    expect(hrefs).toContain('/en/lore');
  });
});
