import { TestBed } from '@angular/core/testing';
import { Awakening } from './awakening';
import { AWAKING_STEPS } from '../content';

describe('Lore Awakening', () => {
  it('pinta los tres niveles de despertar en orden', async () => {
    const fixture = TestBed.createComponent(Awakening);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    const steps = [...el.querySelectorAll('.awake__step')];
    expect(steps.length).toBe(AWAKING_STEPS.length);
    expect(steps[0].textContent).toContain('El Susurro');
    expect(steps[0].textContent).toContain('0+ de Profundidad');
    expect(steps[AWAKING_STEPS.length - 1].textContent).toContain('La Simbiosis');
  });
});
