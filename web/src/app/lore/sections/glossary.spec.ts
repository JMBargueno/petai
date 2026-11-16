import { TestBed } from '@angular/core/testing';
import { Glossary } from './glossary';
import { GLOSSARY } from '../content';

describe('Lore Glossary', () => {
  it('pinta todos los términos técnicos con su nombre de lore', async () => {
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

describe('Lore Glossary — buscador', () => {
  it('filtra sin tildes en el término del lore y en el técnico, y avisa si no hay resultados', async () => {
    const fixture = TestBed.createComponent(Glossary);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const input = el.querySelector<HTMLInputElement>('input[type="search"]')!;

    input.value = 'api';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect([...el.querySelectorAll('.term')].map((t) => t.querySelector('dt')?.textContent)).toEqual(['Chispa de Hermes']);

    input.value = 'telar';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(el.querySelector('.term dt')?.textContent).toBe('Telar de Mulberry');
    expect(el.querySelector('.gloss__count')?.textContent).toContain(`1 de ${GLOSSARY.length}`);

    input.value = 'zzzz';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(el.querySelectorAll('.term').length).toBe(0);
    expect(el.querySelector('.gloss__empty')).not.toBeNull();
  });
});
