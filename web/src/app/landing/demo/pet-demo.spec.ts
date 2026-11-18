import { TestBed } from '@angular/core/testing';
import { PATTERNS, RARITY_ODDS, STARTER_SPECIES } from '../content';
import { DEMO_RANDOM, PetDemo } from './pet-demo';

/**
 * Crea la demo con una secuencia fija de "azar": especie (de las iniciales), rareza de patrón,
 * patrón y shiny, en ese orden.
 */
function setup(...rolls: number[]) {
  const queue = [...rolls];
  TestBed.configureTestingModule({
    providers: [{ provide: DEMO_RANDOM, useValue: () => queue.shift() ?? 0.5 }],
  });
  const fixture = TestBed.createComponent(PetDemo);
  fixture.detectChanges();
  return { fixture, demo: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

/** Tres toques y el huevo estalla (en el navegador lo avisa el efecto `huevo-grietas`). */
const hatch = (demo: PetDemo) => {
  demo.tapEgg();
  demo.tapEgg();
  demo.tapEgg();
  demo.eggDone();
};

describe('PetDemo', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('el huevo eclosiona al tercer toque, no antes', () => {
    const { demo } = setup(0, 0, 0, 0.9);
    demo.tapEgg();
    demo.tapEgg();
    expect(demo.pet()).toBeNull();
    demo.tapEgg();
    expect(demo.pet()).not.toBeNull();
    // El pockai no se ve hasta que el huevo termina de estallar.
    expect(demo.hatching()).toBe(true);
    demo.eggDone();
    expect(demo.hatching()).toBe(false);
  });

  it('solo salen especies iniciales (normales); el patrón y el shiny se sortean aparte', () => {
    const common = setup(0, 0, 0, 0.9).demo;
    hatch(common);
    const plain = PATTERNS.filter((p) => p.rarityId === RARITY_ODDS[0].id)[0];
    expect(common.pet()).toEqual({
      name: STARTER_SPECIES[0].name,
      spriteKey: STARTER_SPECIES[0].spriteKey,
      element: expect.any(String),
      rarity: STARTER_SPECIES[0].rarity,
      pattern: plain.name,
      patternRarity: plain.rarity,
      shiny: false,
    });

    // Con la mejor suerte sigue saliendo una especie normal, pero el patrón sí puede ser mítico.
    TestBed.resetTestingModule();
    const lucky = setup(0.999, 0.999, 0, 0).demo;
    hatch(lucky);
    expect(STARTER_SPECIES.map((s) => s.spriteKey)).toContain(lucky.pet()?.spriteKey);
    expect(lucky.pet()?.patternRarity).toBe(RARITY_ODDS.at(-1)!.name);
    expect(lucky.pet()?.shiny).toBe(true);
  });

  it('las probabilidades de rareza suman 1', () => {
    expect(RARITY_ODDS.reduce((sum, r) => sum + r.probability, 0)).toBeCloseTo(1);
  });

  it('cuidar cambia las barras y el estado, y la reacción termina sola', () => {
    const { demo } = setup(0, 0, 0, 0.9);
    hatch(demo);

    demo.feed();
    expect(demo.hunger()).toBe(85);
    expect(demo.state()).toBe('eat');

    demo.play();
    expect(demo.happiness()).toBe(80);
    expect(demo.hunger()).toBe(80);
    expect(demo.state()).toBe('happy');

    vi.advanceTimersByTime(2000);
    expect(demo.state()).toBe('idle');
  });

  it('las barras no salen de 0–100', () => {
    const { demo } = setup(0, 0, 0.9);
    hatch(demo);
    for (let i = 0; i < 10; i++) demo.feed();
    expect(demo.hunger()).toBe(100);
    for (let i = 0; i < 500; i++) demo.decay();
    expect(demo.hunger()).toBe(0);
    expect(demo.happiness()).toBe(0);
  });

  it('dormido casi no pierde estadísticas y «Otro huevo» vuelve al principio', () => {
    const { demo } = setup(0, 0, 0.9);
    hatch(demo);
    demo.toggleSleep();
    expect(demo.state()).toBe('sleep');
    const before = demo.happiness();
    demo.decay();
    expect(demo.happiness()).toBe(before);

    demo.reset();
    expect(demo.pet()).toBeNull();
    expect(demo.taps()).toBe(0);
  });

  it('pinta el huevo y, tras eclosionar, el pockai con sus acciones', () => {
    const { fixture, demo, el } = setup(0, 0, 0.9);
    expect(el.querySelector('button.egg')).not.toBeNull();
    hatch(demo);
    fixture.detectChanges();
    expect(el.querySelector('app-pockai-sprite img')?.getAttribute('src')).toContain(`${STARTER_SPECIES[0].spriteKey}_baby_`);
    expect(el.querySelectorAll('.actions button').length).toBe(4);
    expect(el.querySelector('[role=status]')?.textContent).toContain(STARTER_SPECIES[0].name);
  });
});
