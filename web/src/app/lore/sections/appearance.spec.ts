import { TestBed } from '@angular/core/testing';
import { Appearance } from './appearance';
import { AETHER_PATTERNS, EARTH_PATTERNS, PATTERN_DEFS } from '../content';

describe('Lore Appearance', () => {
  it('pinta los paneles de mimesis y textura con sus patrones y definiciones', async () => {
    const fixture = TestBed.createComponent(Appearance);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelectorAll('.appear__panel').length).toBe(2);
    const earth = el.querySelector('.appear__panel--earth');
    const aether = el.querySelector('.appear__panel--aether');
    expect(earth?.querySelectorAll('.pattern').length).toBe(EARTH_PATTERNS.length);
    expect(aether?.querySelectorAll('.pattern').length).toBe(AETHER_PATTERNS.length);
    expect(el.querySelectorAll('.appear__def').length).toBe(Object.keys(PATTERN_DEFS).length);
    expect(el.querySelector('.appear__shiny')).toBeTruthy();
  });
});
