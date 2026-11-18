import { TestBed } from '@angular/core/testing';
import { Glossary } from './glossary';
import { GLOSSARY, SPECIES } from '../content';

describe('Aether Codex — Glosario', () => {
  it('pinta los catorce términos técnicos con su nombre de lore', async () => {
    const fixture = TestBed.configureTestingModule({ imports: [Glossary] }).createComponent(Glossary);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    const terms = [...el.querySelectorAll('.term')];
    expect(terms.length).toBe(GLOSSARY.length);
    expect(terms[0].textContent).toContain('Jugador');
    expect(terms[0].textContent).toContain('Custodio');
    expect(terms[GLOSSARY.length - 1].textContent).toContain('Seed / RNG');
    expect(terms[GLOSSARY.length - 1].textContent).toContain('Telar de Mulberry');
  });

  it('tiene dos tabs: Glosario y Pockais', async () => {
    const fixture = TestBed.configureTestingModule({ imports: [Glossary] }).createComponent(Glossary);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    const tabs = [...el.querySelectorAll<HTMLButtonElement>('.codex__tab')];
    expect(tabs.length).toBe(2);
    expect(tabs[0].textContent).toContain('Glosario');
    expect(tabs[1].textContent).toContain('Pockais');
    // El tab activo por defecto es Glosario
    expect(tabs[0].classList.contains('codex__tab--active')).toBe(true);
    expect(tabs[1].classList.contains('codex__tab--active')).toBe(false);
  });

  it('muestra el compendio de Pockais al cambiar de tab', async () => {
    const fixture = TestBed.configureTestingModule({ imports: [Glossary] }).createComponent(Glossary);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    // Click en el tab Pockais
    const tabs = [...el.querySelectorAll<HTMLButtonElement>('.codex__tab')];
    tabs[1].click();
    await fixture.whenStable();

    const cards = [...el.querySelectorAll('.codex__card')];
    expect(cards.length).toBe(SPECIES.length);
    expect(cards[0].textContent).toContain(SPECIES[0].name);
  });
});

describe('Aether Codex — Buscador', () => {
  it('filtra sin tildes en el término del lore y en el técnico, y avisa si no hay resultados', async () => {
    const fixture = TestBed.configureTestingModule({ imports: [Glossary] }).createComponent(Glossary);
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

  it('filtra especies por nombre en el tab Pockais', async () => {
    const fixture = TestBed.configureTestingModule({ imports: [Glossary] }).createComponent(Glossary);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    // Cambiar al tab Pockais
    const tabs = [...el.querySelectorAll<HTMLButtonElement>('.codex__tab')];
    tabs[1].click();
    await fixture.whenStable();

    const input = el.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = SPECIES[0].name;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    const cards = [...el.querySelectorAll('.codex__card')];
    expect(cards.length).toBe(1);
    expect(cards[0].textContent).toContain(SPECIES[0].name);
  });
});
