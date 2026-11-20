<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { bakePetSpriteSheet, getAnimLibrary, type BakedPetSheet } from '@pockai/scene/sprites';
  import { AnimationController } from '@pockai/scene/sprites';
  import { EGG_PALETTE } from './maps';

  /** Huevo animado: `idle` (balanceo), `shake` (temblor), `crack` (grietas), `hatch` (eclosión). */
  export let anim: 'idle' | 'shake' | 'crack' | 'hatch' = 'idle';
  export let size = 64;

  const lib = getAnimLibrary('egg');
  const controller = new AnimationController(lib.library, lib.aliases);
  let sheet: BakedPetSheet | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let raf: number | null = null;
  let last = 0;

  // `shake` en bucle se usa como movimiento; `crack` y `hatch` son acciones de una pasada
  $: {
    controller.setMotion(anim === 'shake' ? 'shake' : null);
    if (anim === 'crack' || anim === 'hatch') controller.play(anim);
    else controller.stop();
  }

  function loop(time: number) {
    const dt = last ? Math.min(time - last, 250) : 16;
    last = time;
    const f = controller.update(dt);
    const ctx = canvas?.getContext('2d');
    if (ctx && sheet) {
      const r = sheet.getFrame(f.name, f.frame);
      ctx.clearRect(0, 0, 128, 128);
      ctx.drawImage(sheet.canvas, r.sx, r.sy, r.sw, r.sh, 0, 0, 128, 128);
    }
    raf = requestAnimationFrame(loop);
  }

  onMount(async () => {
    raf = requestAnimationFrame(loop);
    try {
      sheet = await bakePetSpriteSheet('egg', 'plain', EGG_PALETTE);
    } catch {
      sheet = null;
    }
  });

  onDestroy(() => {
    if (raf !== null) cancelAnimationFrame(raf);
  });
</script>

<div class="egg" style="width: {size}px; height: {size}px;">
  <!-- Mientras se hornea la hoja el hueco queda vacío (el huevo SVG antiguo ya no existe) -->
  {#if sheet}
    <canvas bind:this={canvas} width="128" height="128" aria-hidden="true"></canvas>
  {/if}
</div>

<style>
  .egg {
    display: grid;
    place-items: center;
  }
  canvas {
    width: 100%;
    height: 100%;
  }
</style>
