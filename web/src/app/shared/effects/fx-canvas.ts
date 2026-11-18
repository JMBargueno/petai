import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CanvasSink, EFFECTS, EffectPlayer, flowPalette, phasesOf, quantize, renderFrame } from '@pockai/scene/effects';

/**
 * Un efecto del paquete común (@pockai/scene/effects: los mismos del escritorio y de la escena
 * móvil) pintado en vivo en un canvas pixel art. Es la versión web de `EffectLayer.svelte`.
 *
 * Arranca solo en el navegador (nada de canvas en SSR). Una fase `hold` espera a `release()`;
 * al terminar emite `done` y deja el canvas en blanco. El tamaño en pantalla lo decide el CSS de
 * quien lo usa (el canvas ocupa el ancho del host y mantiene la proporción).
 */
@Component({
  selector: 'app-fx-canvas',
  template: `<canvas
    #canvas
    [width]="def().width * def().scale"
    [height]="def().height * def().scale"
    [style.opacity]="opacity()"
    [attr.data-effect]="def().id"
  ></canvas>`,
  styles: `
    :host {
      display: block;
      line-height: 0;
      pointer-events: none;
    }
    canvas {
      width: 100%;
      height: auto;
      image-rendering: pixelated;
    }
  `,
  host: { 'aria-hidden': 'true' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FxCanvas {
  /** Id del efecto en `EFFECTS` (p. ej. `huevo-grietas`). */
  readonly effect = input.required<string>();
  /** Elemento (Flujo) cuya rampa colorea el efecto; se lee en cada frame, así que puede cambiar. */
  readonly element = input('');
  readonly params = input<Record<string, string | number>>({});
  readonly seed = input(1);
  /** Cada fase nueva, en orden (y `done` al final). */
  readonly phase = output<string>();
  readonly done = output<void>();

  protected readonly def = computed(() => {
    const def = EFFECTS[this.effect()];
    if (!def) throw new Error(`Efecto desconocido: ${this.effect()}`);
    return def;
  });
  protected readonly opacity = signal(1);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private player: EffectPlayer | null = null;
  private pendingRelease = false;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const def = this.def();
      const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      const player = new EffectPlayer(phasesOf(def, this.params(), reduced), (name) => {
        if (name === 'done') this.done.emit();
        else this.phase.emit(name);
      });
      const ctx = this.canvas().nativeElement.getContext('2d');
      let raf = 0;
      let lastKey = '';
      const loop = (now: number) => {
        // Tiempo cuantizado a la cadencia del efecto: el progreso va a saltos, como un sprite.
        const elapsed = quantize(player.elapsed(now), def.fps);
        const state = player.tick(now - (player.elapsed(now) - elapsed));
        const key = `${state.phase}:${elapsed}:${this.element()}`;
        if (ctx && key !== lastKey) {
          lastKey = key;
          ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
          if (!state.done) {
            const sink = new CanvasSink(ctx, def.width, def.height, def.scale);
            const frame = renderFrame(
              def,
              sink,
              { phase: state.phase, t: state.t, elapsedMs: elapsed },
              flowPalette(this.element()),
              this.seed(),
              reduced,
              this.params(),
            );
            this.opacity.set(def.opacity ? def.opacity(frame) : 1);
          }
        }
        raf = state.done ? 0 : requestAnimationFrame(loop);
      };
      player.start(performance.now());
      this.player = player;
      if (this.pendingRelease) player.release(performance.now());
      raf = requestAnimationFrame(loop);
      destroyRef.onDestroy(() => cancelAnimationFrame(raf));
    });
  }

  /** Suelta la fase `hold` (o la próxima, si aún no ha llegado). */
  release(): void {
    if (this.player) this.player.release(performance.now());
    else this.pendingRelease = true;
  }
}
