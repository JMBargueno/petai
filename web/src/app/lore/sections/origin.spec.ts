import { TestBed } from '@angular/core/testing';
import { Origin } from './origin';
import { ORIGIN_CARDS } from '../content';

describe('Lore Origin', () => {
  it('pinta los cuatro pasos del origen en orden', async () => {
    const fixture = TestBed.createComponent(Origin);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    const steps = [...el.querySelectorAll('.card')];
    expect(steps.length).toBe(ORIGIN_CARDS.length);
    expect(steps[0].querySelector('h3')?.textContent?.trim()).toBe('Códices Latentes');
    expect(steps[ORIGIN_CARDS.length - 1].querySelector('h3')?.textContent?.trim()).toBe('Incubación (5 min – 8 h)');
  });
});
