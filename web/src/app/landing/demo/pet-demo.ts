import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  InjectionToken,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { PockaiSprite, PockaiState } from '../../shared/ui/pockai-sprite';
import { Sticker } from '../../shared/ui/sticker';
import { RARITY_ODDS, SHINY_PROBABILITY, SPECIES } from '../content';

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
 * Todo ocurre en el navegador. La rareza se sortea con las probabilidades reales del juego,
 * pero en el juego de verdad esa tirada la hace el servidor.
 */
@Component({
  selector: 'app-pet-demo',
  imports: [PockaiSprite, Sticker],
  templateUrl: './pet-demo.html',
  styleUrl: './pet-demo.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PetDemo {
  private readonly random = inject(DEMO_RANDOM);
  private reaction?: ReturnType<typeof setTimeout>;

  protected readonly tapsToHatch = TAPS_TO_HATCH;
  readonly taps = signal(0);
  readonly pet = signal<{ name: string; spriteKey: string; rarity: string; shiny: boolean } | null>(null);
  readonly state = signal<PockaiState>('idle');
  readonly hunger = signal(60);
  readonly happiness = signal(60);
  readonly message = signal('');

  protected readonly eggSprite = computed(() =>
    this.taps() >= TAPS_TO_HATCH - 1 ? 'sprites/egg_cracked.svg' : 'sprites/egg_closed.svg',
  );
  protected readonly burst = [
    { icon: 'star', color: 'sunburst' },
    { icon: 'heart', color: 'ember' },
    { icon: 'bolt', color: 'mint-pop' },
    { icon: 'star', color: 'lavender' },
    { icon: 'coin', color: 'electric-blue' },
    { icon: 'heart', color: 'sunburst' },
  ] as const;

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
    this.taps.update((n) => n + 1);
    if (this.taps() >= TAPS_TO_HATCH) this.hatch();
  }

  private hatch() {
    const roll = this.random();
    let limit = 0;
    const rarity = RARITY_ODDS.find((r) => roll < (limit += r.probability)) ?? RARITY_ODDS[0];
    const species = SPECIES[Math.floor(this.random() * SPECIES.length)];
    const shiny = this.random() < SHINY_PROBABILITY;

    this.pet.set({ name: species.name, spriteKey: species.spriteKey, rarity: rarity.name, shiny });
    this.hunger.set(60);
    this.happiness.set(60);
    this.react('happy');
    this.message.set(
      shiny
        ? $localize`:@@demo.hatched.shiny:¡Ha salido ${species.name}:NAME:, ${rarity.name}:RARITY: y shiny!`
        : $localize`:@@demo.hatched:¡Ha salido ${species.name}:NAME:, ${rarity.name}:RARITY:!`,
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
