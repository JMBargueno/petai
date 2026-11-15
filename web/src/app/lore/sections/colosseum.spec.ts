import { TestBed } from '@angular/core/testing';
import { Colosseum } from './colosseum';
import { COLISEUM_CARDS } from '../content';

describe('Lore Colosseum', () => {
  it('pinta los tres pilares del Coliseo de Resonancia', async () => {
    const fixture = TestBed.createComponent(Colosseum);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    const cards = [...el.querySelectorAll('.colo__card')];
    expect(cards.length).toBe(COLISEUM_CARDS.length);
    expect(cards[0].textContent).toContain('Duelo de Proyección');
    expect(cards[1].textContent).toContain('Sombra Guardiana');
    expect(cards[2].textContent).toContain('Ligas');
  });
});
