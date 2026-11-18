<script lang="ts">
  /**
   * Pinta un efecto del escritorio (lib/effects) en un canvas pixel art. No recibe clics ni entra
   * en las zonas interactivas del click-through: es solo decorado.
   *
   * Quien lo lanza crea el `EffectPlayer` (decide cuándo soltar la fase `hold`) y quita el
   * componente cuando el reproductor avisa de `done`.
   */
  import { onDestroy, onMount } from 'svelte';
  import type { EffectDef, FxPalette } from '../lib/effects/types';
  import { CanvasSink, renderFrame } from '../lib/effects/render';
  import { quantize, type EffectPlayer } from '../lib/effects/timeline';

  export let def: EffectDef;
  export let player: EffectPlayer;
  /** Punto de la pantalla (px) donde cae el anclaje del efecto (p. ej. los pies del portal). */
  export let x: number;
  export let y: number;
  export let palette: FxPalette;
  export let seed = 1;
  export let reduced = false;
  /** Por encima o por debajo de la mascota. */
  export let layer: 'behind' | 'front' = 'behind';

  let canvas: HTMLCanvasElement;
  let raf: number | null = null;
  let lastKey = '';
  let opacity = 1;

  $: left = Math.round(x - (def.anchor.x + 0.5) * def.scale);
  $: top = Math.round(y - (def.anchor.y + 1) * def.scale);

  function loop(now: number) {
    // El reproductor se consulta con el tiempo cuantizado: el progreso va a saltos, como un sprite.
    const elapsed = quantize(player.elapsed(now), def.fps);
    const qNow = now - (player.elapsed(now) - elapsed);
    const state = player.tick(qNow);
    const key = `${state.phase}:${elapsed}`;
    if (key !== lastKey && canvas) {
      lastKey = key;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const sink = new CanvasSink(ctx, def.width, def.height, def.scale);
        const frame = renderFrame(def, sink, { phase: state.phase, t: state.t, elapsedMs: elapsed }, palette, seed, reduced);
        opacity = def.opacity ? def.opacity(frame) : 1;
        if (state.done) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    }
    raf = state.done ? null : requestAnimationFrame(loop);
  }

  onMount(() => {
    raf = requestAnimationFrame(loop);
  });
  onDestroy(() => {
    if (raf !== null) cancelAnimationFrame(raf);
  });
</script>

<canvas
  bind:this={canvas}
  class="fx-layer"
  class:front={layer === 'front'}
  width={def.width * def.scale}
  height={def.height * def.scale}
  style="left: {left}px; top: {top}px; opacity: {opacity};"
  aria-hidden="true"
  data-effect={def.id}
></canvas>

<style>
  .fx-layer {
    position: absolute;
    pointer-events: none;
    image-rendering: pixelated;
    z-index: calc(var(--z-pet) - 1);
  }
  .fx-layer.front {
    z-index: calc(var(--z-pet) + 1);
  }
</style>
