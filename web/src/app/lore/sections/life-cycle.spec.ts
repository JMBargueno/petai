import { TestBed } from '@angular/core/testing';
import { LifeCycle } from './life-cycle';
import { LIFE_STAGES } from '../content';

describe('Lore LifeCycle', () => {
  it('pinta las cinco etapas con su nivel y las tarjetas de sueño y letargo', async () => {
    const fixture = TestBed.createComponent(LifeCycle);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    const stages = [...el.querySelectorAll('.stage')];
    expect(stages.length).toBe(LIFE_STAGES.length);
    expect(stages[0].querySelector('.stage__name')?.textContent).toBe('Huevo');
    expect(stages[0].querySelector('.stage__level')).toBeNull();
    const last = stages[LIFE_STAGES.length - 1];
    expect(last.querySelector('.stage__name')?.textContent).toBe('Forma Final');
    expect(last.querySelector('.stage__level')?.textContent).toBe('nv 50');

    expect(el.querySelector('.life__card--sleep')?.textContent).toContain('Desfragmentación');
    expect(el.querySelector('.life__card--welcome')?.textContent).toContain('Letargo Melancólico');
  });
});
