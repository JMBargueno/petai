import { TestBed } from '@angular/core/testing';
import { RARITY_ODDS, SPECIES } from '../content';
import { DEMO_RANDOM, PetDemo } from './pet-demo';

/** Crea la demo con una secuencia fija de "azar": rareza, especie y shiny, en ese orden. */
function setup(...rolls: number[]) {
  const queue = [...rolls];
  TestBed.configureTestingModule({
    providers: [{ provide: DEMO_RANDOM, useValue: () => queue.shift() ?? 0.5 }],
  });
  const fixture = TestBed.createComponent(PetDemo);
  fixture.detectChanges();
  return { fixture, demo: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

const hatch = (demo: PetDemo) => {
  demo.tapEgg();
  demo.tapEgg();
  demo.tapEgg();
};

describe('PetDemo', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('el huevo eclosiona al tercer toque, no antes', () => {
    const { demo } = setup(0, 0, 0.9);
    demo.tapEgg();
    demo.tapEgg();
    expect(demo.pet()).toBeNull();
    demo.tapEgg();
    expect(demo.pet()).not.toBeNull();
  });

  it('sortea rareza, especie y shiny con las probabilidades del juego', () => {
    const common = setup(0, 0, 0.9).demo;
    hatch(common);
    expect(common.pet()).toEqual({
      name: SPECIES[0].name,
      spriteKey: SPECIES[0].spriteKey,
      rarity: RARITY_ODDS[0].name,
      shiny: false,
    });

    TestBed.resetTestingModule();
    const lucky = setup(0.999, 0.99, 0).demo;
    hatch(lucky);
    expect(lucky.pet()?.rarity).toBe(RARITY_ODDS.at(-1)!.name);
    expect(lucky.pet()?.spriteKey).toBe(SPECIES.at(-1)!.spriteKey);
    expect(lucky.pet()?.shiny).toBe(true);
  });

  it('las probabilidades de rareza suman 1', () => {
    expect(RARITY_ODDS.reduce((sum, r) => sum + r.probability, 0)).toBeCloseTo(1);
  });

  it('cuidar cambia las barras y el estado, y la reacción termina sola', () => {
    const { demo } = setup(0, 0, 0.9);
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
    expect(el.querySelector('app-pockai-sprite img')?.getAttribute('src')).toContain(SPECIES[0].spriteKey);
    expect(el.querySelectorAll('.actions button').length).toBe(4);
    expect(el.querySelector('[role=status]')?.textContent).toContain(SPECIES[0].name);
  });
});
