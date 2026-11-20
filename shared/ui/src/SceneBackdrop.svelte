<script lang="ts">
  /**
   * Fondo animado de una pantalla del juego (Arena, Raid, Torneo, Entrenamiento, Cocina): el mismo
   * escenario por capas que la aventura diaria, pintado en un `<canvas>` 2D (sin WebGL). Decorativo:
   * un solo bucle, que se detiene cuando no se ve, y un fotograma fijo con movimiento reducido.
   */
  import { onDestroy, onMount } from 'svelte';
  import { mountBackdrop, screenComposition, type BackdropHandle } from '@pockai/scene/backdrop';

  /** Pantalla de `shared/game-data/story-locations.json` → `screens`. */
  export let screen: string;
  export let height = 96;

  let canvas: HTMLCanvasElement;
  let handle: BackdropHandle | null = null;
  let mounted = false;

  onMount(() => {
    mounted = true;
  });
  onDestroy(() => {
    handle?.destroy();
    handle = null;
  });

  $: if (mounted && canvas) {
    const comp = screenComposition(screen);
    if (comp) {
      if (handle) handle.set(comp);
      else handle = mountBackdrop(canvas, comp, { lifeBudget: 0.6 });
    }
  }
</script>

<canvas class="scene-backdrop" style="--backdrop-h: {height}px" bind:this={canvas} aria-hidden="true"></canvas>

<style>
  .scene-backdrop {
    display: block;
    width: 100%;
    height: var(--backdrop-h);
    border-radius: calc(var(--radius-cards) - 4px);
    image-rendering: pixelated;
  }
</style>
