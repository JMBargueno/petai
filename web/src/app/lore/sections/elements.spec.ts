import { TestBed } from '@angular/core/testing';
import { Elements } from './elements';
import { ELEMENTS } from '../content';

describe('Lore Elements', () => {
  it('pinta los seis flujos con su nombre técnico de lore', async () => {
    const fixture = TestBed.createComponent(Elements);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    const cards = [...el.querySelectorAll('.element')];
    expect(cards.length).toBe(ELEMENTS.length);
    expect(cards[0].textContent).toContain('Termo-Impulso');
    expect(cards[ELEMENTS.length - 1].textContent).toContain('Fibra Óptica');
  });
});
