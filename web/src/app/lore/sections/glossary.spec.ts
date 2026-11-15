import { TestBed } from '@angular/core/testing';
import { Glossary } from './glossary';
import { GLOSSARY } from '../content';

describe('Lore Glossary', () => {
  it('pinta los catorce términos técnicos con su nombre de lore', async () => {
    const fixture = TestBed.createComponent(Glossary);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    const terms = [...el.querySelectorAll('.term')];
    expect(terms.length).toBe(GLOSSARY.length);
    expect(terms[0].textContent).toContain('Jugador');
    expect(terms[0].textContent).toContain('Custodio');
    expect(terms[GLOSSARY.length - 1].textContent).toContain('Seed / RNG');
    expect(terms[GLOSSARY.length - 1].textContent).toContain('Telar de Mulberry');
  });
});
