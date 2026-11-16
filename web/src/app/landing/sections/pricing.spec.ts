import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, vi } from 'vitest';
import { Pricing } from './pricing';
import { PRICING_CARDS } from '../content';

describe('Pricing', () => {
  // Nunca se llama al API real desde los tests (site.json apunta a producción)
  beforeEach(() => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) }))));

  it('pinta los tres planes de precios transparentes', async () => {
    const fixture = TestBed.createComponent(Pricing);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    const cards = el.querySelectorAll('.pricing-card');
    expect(cards.length).toBe(PRICING_CARDS.length);

    const titles = Array.from(el.querySelectorAll('.pricing-card h3')).map((h) => h.textContent?.trim());
    expect(titles).toEqual(PRICING_CARDS.map((c) => c.title));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('sustituye el precio de Pro por el configurado en el panel (GET /v1/billing/plans)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ plans: { pro: { priceEur: 12.5 } } }) })),
    );
    const fixture = TestBed.createComponent(Pricing);
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    const amounts = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.amount')).map((a) =>
      a.textContent?.trim(),
    );
    expect(amounts[1]).toMatch(/12[,.]50/);
    expect(amounts[0]).toBe(PRICING_CARDS[0].price);
  });

  it('si el API falla mantiene el precio estático', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const fixture = TestBed.createComponent(Pricing);
    await fixture.whenStable();
    const amounts = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.amount')).map((a) =>
      a.textContent?.trim(),
    );
    expect(amounts[1]).toBe(PRICING_CARDS[1].price);
  });
});
