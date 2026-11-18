import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  InjectionToken,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { speciesElement } from '@pockai/scene/effects';
import { FxCanvas } from '../../shared/effects/fx-canvas';
import { PockaiSprite, PockaiState } from '../../shared/ui/pockai-sprite';
import { ofRolledRarity, PATTERNS, RARITY_ODDS, SHINY_PROBABILITY, STARTER_SPECIES } from '../content';

/** Fuente de azar de la demo (0 ≤ n < 1). Los tests la sustituyen por una secuencia fija. */
export const DEMO_RANDOM = new InjectionToken<() => number>('DEMO_RANDOM', {
  providedIn: 'root',
  factory: () => Math.random,
});

const TAPS_TO_HATCH = 3;
const REACTION_MS = 1600;
const clamp = (n: number) => Math.max(0, Math.min(100, n));

/**
 * Demo jugable: tocar un huevo hasta que eclosiona y cuidar al pockai que sale.
 * Todo ocurre en el navegador. Como el primer huevo de una partida, sale una de las especies
 * iniciales (rareza normal) y en etapa bebé; el patrón y el shiny sí se sortean con las
 * probabilidades reales del juego (en el juego de verdad esas tiradas las hace el servidor).
 * La eclosión usa los efectos del paquete común, como el escritorio: el huevo con grietas de luz
 * (`huevo-grietas`) y, al nacer, la Revelación de densidad detrás de la recién nacida.
 */
@Component({
  selector: 'app-pet-demo',
  imports: [FxCanvas, PockaiSprite],
  templateUrl: './pet-demo.html',
  styleUrl: './pet-demo.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PetDemo {
  private readonly random = inject(DEMO_RANDOM);
  private reaction?: ReturnType<typeof setTimeout>;

  protected readonly tapsToHatch = TAPS_TO_HATCH;
  readonly taps = signal(0);
  readonly pet = signal<{
    name: string;
    spriteKey: string;
    element: string;
    rarity: string;
    pattern: string;
    patternRarity: string;
    shiny: boolean;
  } | null>(null);
  /** El huevo aún se está rompiendo: el pockai ya está decidido pero no se ve. */
  readonly hatching = signal(false);
  /** La Revelación de densidad sube detrás de la recién nacida. */
  readonly revealing = signal(false);
  readonly state = signal<PockaiState>('idle');
  readonly hunger = signal(60);
  readonly happiness = signal(60);
  readonly message = signal('');

  private readonly egg = viewChild<FxCanvas>('egg');

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => clearTimeout(this.reaction));
    // Las estadísticas bajan solas, como en el juego; solo en el navegador.
    afterNextRender(() => {
      const timer = setInterval(() => this.decay(), 1000);
      destroyRef.onDestroy(() => clearInterval(timer));
    });
  }

  tapEgg() {
    if (this.pet()) return;
    this.taps.update((n) => n + 1);
    if (this.taps() >= TAPS_TO_HATCH) this.hatch();
  }

  /** El huevo ha estallado: aparece la recién nacida con su revelación detrás. */
  eggDone() {
    if (!this.hatching()) return;
    this.hatching.set(false);
    this.revealing.set(true);
  }

  /** Tirada de rareza con las probabilidades del juego. */
  private rollRarity() {
    const roll = this.random();
    let limit = 0;
    return RARITY_ODDS.find((r) => roll < (limit += r.probability)) ?? RARITY_ODDS[0];
  }

  private pick<T>(items: T[]): T {
    return items[Math.min(items.length - 1, Math.floor(this.random() * items.length))];
  }

  private hatch() {
    // Del huevo de la demo solo salen las especies iniciales (rareza normal), como en el primer huevo.
    const species = this.pick(STARTER_SPECIES);
    // El patrón tiene su propia rareza y su propia tirada.
    const pattern = this.pick(ofRolledRarity(PATTERNS, this.rollRarity().id));
    const shiny = this.random() < SHINY_PROBABILITY;

    // Las grietas brillan con el Flujo de quien nace y el huevo estalla; al acabar, `eggDone`.
    this.hatching.set(true);
    this.pet.set({
      name: species.name,
      spriteKey: species.spriteKey,
      element: speciesElement(species.id),
      rarity: species.rarity,
      pattern: pattern.name,
      patternRarity: pattern.rarity,
      shiny,
    });
    this.egg()?.release();
    this.hunger.set(60);
    this.happiness.set(60);
    this.react('happy');
    this.message.set(
      shiny
        ? $localize`:@@demo.hatched.shiny:¡Ha salido ${species.name}:NAME:, ${species.rarity}:RARITY:, con patrón ${pattern.name}:PATTERN: (${pattern.rarity}:PRARITY:) y además shiny!`
        : $localize`:@@demo.hatched:¡Ha salido ${species.name}:NAME:, ${species.rarity}:RARITY:, con patrón ${pattern.name}:PATTERN: (${pattern.rarity}:PRARITY:)!`,
    );
  }

  feed() {
    this.hunger.update((n) => clamp(n + 25));
    this.react('eat');
    this.message.set($localize`:@@demo.fed:Ñam. Tiene menos hambre.`);
  }

  play() {
    this.happiness.update((n) => clamp(n + 20));
    this.hunger.update((n) => clamp(n - 5));
    this.react('happy');
    this.message.set($localize`:@@demo.played:¡Le encanta jugar!`);
  }

  toggleSleep() {
    clearTimeout(this.reaction);
    const sleeping = this.state() === 'sleep';
    this.state.set(sleeping ? 'idle' : 'sleep');
    this.message.set(
      sleeping ? $localize`:@@demo.awake:Se ha despertado.` : $localize`:@@demo.asleep:Se ha dormido. Chsss.`,
    );
  }

  reset() {
    clearTimeout(this.reaction);
    this.pet.set(null);
    this.hatching.set(false);
    this.revealing.set(false);
    this.taps.set(0);
    this.state.set('idle');
    this.message.set('');
  }

  /** Un segundo de vida: despierto pierde hambre y felicidad; dormido, casi nada. */
  decay() {
    if (!this.pet()) return;
    const sleeping = this.state() === 'sleep';
    this.hunger.update((n) => clamp(n - (sleeping ? 0.3 : 1)));
    this.happiness.update((n) => clamp(n - (sleeping ? 0 : 0.6)));
  }

  private react(state: PockaiState) {
    clearTimeout(this.reaction);
    this.state.set(state);
    this.reaction = setTimeout(() => this.state.set('idle'), REACTION_MS);
  }
}
