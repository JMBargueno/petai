import { TestBed } from '@angular/core/testing';
import { Rarities, rollBatch } from './rarities';
import { RARITY_ODDS } from '../content';

describe('Rarities', () => {
  it('tira las rarezas según las probabilidades reales', () => {
    // Cada huevo pide dos números: la rareza (repartida uniformemente en [0, 1)) y el shiny (nunca).
    const size = 1000;
    let call = 0;
    let egg = 0;
    const random = () => (call++ % 2 === 0 ? egg++ / size : 0.999);
    const eggs = rollBatch(random, size);

    const counts = RARITY_ODDS.map((_, r) => eggs.filter((e) => e.rarity === r).length);
    RARITY_ODDS.forEach((r, k) => expect(counts[k]).toBeCloseTo(r.probability * size, -1));
    expect(eggs.some((e) => e.shiny)).toBe(false);
  });

  it('pinta una tanda de 100 huevos con su recuento y la renueva al pulsar', async () => {
    const fixture = TestBed.createComponent(Rarities);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelectorAll('.batch__egg').length).toBe(100);
    const total = () =>
      [...el.querySelectorAll('.batch__legend li strong')]
        .slice(0, RARITY_ODDS.length)
        .reduce((sum, s) => sum + Number(s.textContent), 0);
    expect(total()).toBe(100);

    el.querySelector<HTMLButtonElement>('.batch__roll')!.click();
    await fixture.whenStable();
    expect(el.querySelectorAll('.batch__egg').length).toBe(100);
    expect(total()).toBe(100);
    expect(el.querySelectorAll('.odd').length).toBe(RARITY_ODDS.length);
  });
});
