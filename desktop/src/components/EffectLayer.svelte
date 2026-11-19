<script lang="ts">
  /**
   * Pinta un efecto (@pockai/scene/effects) en un canvas pixel art. No recibe clics ni entra
   * en las zonas interactivas del click-through: es solo decorado.
   *
   * Quien lo lanza crea el `EffectPlayer` (decide cuándo soltar la fase `hold`) y quita el
   * componente cuando el reproductor avisa de `done`.
   */
  import { onDestroy, onMount } from 'svelte';
  import { CanvasSink, quantize, renderFrame, type EffectDef, type EffectPlayer, type FxPalette } from '@pockai/scene/effects';

  export let def: EffectDef;
  export let player: EffectPlayer;
  /** Punto de la pantalla (px) donde cae el anclaje del efecto (p. ej. los pies del portal). */
  export let x: number;
  export let y: number;
  export let palette: FxPalette;
  export let seed = 1;
  export let reduced = false;
  /** Datos del momento para el dibujo (ver cada efecto). */
  export let params: Record<string, string | number> = {};
  /** Por encima o por debajo de la mascota. */
  export let layer: 'behind' | 'front' = def.layer ?? 'behind';
  /** Escala entera en pantalla (por defecto la del efecto; 1 para mascotas pintadas a ×1). */
  export let scale: number = def.scale;

  let canvas: HTMLCanvasElement;
  let raf: number | null = null;
  let lastKey = '';
  let opacity = 1;

  /**
   * Efecto de pantalla (`space: 'screen'`): el lienzo cubre todo el viewport y el dibujo recibe
   * `viewport / scale` celdas; `x`/`y` no se usan (las coordenadas van en `params`).
   */
  $: screen = def.space === 'screen';
  let vw = typeof window !== 'undefined' ? window.innerWidth : 800;
  let vh = typeof window !== 'undefined' ? window.innerHeight : 600;
  $: cells = screen ? { w: Math.ceil(vw / scale), h: Math.ceil(vh / scale) } : { w: def.width, h: def.height };
  $: left = screen ? 0 : Math.round(x - (def.anchor.x + 0.5) * scale);
  $: top = screen ? 0 : Math.round(y - (def.anchor.y + 1) * scale);
  // Si cambian los datos (p. ej. el objeto al que apunta la hebra se mueve), se repinta
  $: paramsKey = JSON.stringify(params);

  function loop(now: number) {
    // El reproductor se consulta con el tiempo cuantizado: el progreso va a saltos, como un sprite.
    const elapsed = quantize(player.elapsed(now), def.fps);
    const qNow = now - (player.elapsed(now) - elapsed);
    const state = player.tick(qNow);
    const key = `${state.phase}:${elapsed}:${paramsKey}:${cells.w}x${cells.h}`;
    if (key !== lastKey && canvas) {
      lastKey = key;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const sink = new CanvasSink(ctx, cells.w, cells.h, scale);
        const frame = renderFrame(def, sink, { phase: state.phase, t: state.t, elapsedMs: elapsed }, palette, seed, reduced, params);
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

<svelte:window bind:innerWidth={vw} bind:innerHeight={vh} />

<canvas
  bind:this={canvas}
  class="fx-layer"
  class:front={layer === 'front'}
  width={cells.w * scale}
  height={cells.h * scale}
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
