import { TestBed } from '@angular/core/testing';
import { Pricing } from './pricing';
import { PRICING_CARDS } from '../content';

describe('Pricing', () => {
  it('pinta los tres planes de precios transparentes', async () => {
    const fixture = TestBed.createComponent(Pricing);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    const cards = el.querySelectorAll('.pricing-card');
    expect(cards.length).toBe(PRICING_CARDS.length);

    const titles = Array.from(el.querySelectorAll('.pricing-card h3')).map((h) => h.textContent?.trim());
    expect(titles).toEqual(PRICING_CARDS.map((c) => c.title));
  });
});
