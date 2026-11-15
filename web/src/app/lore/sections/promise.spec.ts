import { TestBed } from '@angular/core/testing';
import { PromiseSection } from './promise';
import { LORE_RARITIES } from '../content';

describe('Lore Promise (rarezas)', () => {
  it('pinta las cinco rarezas con su probabilidad real y la promesa 30/120', async () => {
    const fixture = TestBed.createComponent(PromiseSection);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    const rows = [...el.querySelectorAll('.rarity')];
    expect(rows.length).toBe(LORE_RARITIES.length);
    expect(rows[0].textContent).toContain('Eco Cotidiano');
    expect(rows[0].textContent).toContain(`${LORE_RARITIES[0].percent}%`);
    expect(rows[LORE_RARITIES.length - 1].textContent).toContain('Singularidad Primordial');
    expect(el.querySelectorAll('.promise__milestone').length).toBe(2);
  });
});
