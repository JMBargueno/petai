import { TestBed } from '@angular/core/testing';
import { Mark } from './mark';
import { MARK_CARDS } from '../content';

describe('Lore Mark', () => {
  it('pinta la sección #huella con carácter, recuerdos y vida en el Éter', async () => {
    const fixture = TestBed.createComponent(Mark);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('section#huella')).not.toBeNull();
    const cards = [...el.querySelectorAll('.mark__card')];
    expect(cards.length).toBe(MARK_CARDS.length);
    expect(cards.map((c) => c.querySelector('h3')?.textContent)).toEqual(['El Carácter', 'El Cristal de Recuerdos', 'La Vida en el Éter']);
  });

  it('no expone cifras ni mecánica interna', () => {
    const text = MARK_CARDS.map((c) => `${c.title} ${c.body}`).join(' ');
    expect(text).not.toMatch(/\d/);
    expect(text).not.toMatch(/dimensi|intervalo|LLM|capa|algoritm/i);
  });
});
