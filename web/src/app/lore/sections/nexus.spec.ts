import { TestBed } from '@angular/core/testing';
import { Nexus } from './nexus';
import { NEXUS_CARDS, NEXUS_RANKS } from '../content';

describe('Lore Nexus', () => {
  it('explica por qué existen los Nexos y pinta los cuatro rangos en orden', async () => {
    const fixture = TestBed.createComponent(Nexus);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    const cards = [...el.querySelectorAll('.nexus__card')];
    expect(cards.length).toBe(NEXUS_CARDS.length);
    expect(cards[0].textContent).toContain('Gran Deriva');

    const ranks = [...el.querySelectorAll('.nexus__rank-name')].map((r) => r.textContent?.trim());
    expect(ranks.length).toBe(NEXUS_RANKS.length);
    expect(ranks).toEqual(['Forjador del Nexo', 'Guardián', 'Vigía', 'Hermano · Hermana']);
  });
});
