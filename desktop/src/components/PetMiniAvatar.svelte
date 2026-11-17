<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    bakePetSpriteSheet,
    getAnimLibrary,
    getPetSvg,
    getPatternSvg,
    type BakedPetSheet,
  } from '../lib/sprites';
  import { AnimationController, resolveBaseState } from '../lib/animation/AnimationController';

  export let pet: any;
  export let size: number = 80;
  export let anim: string = 'idle';
  export let interactive: boolean = true;
  export let draggable: boolean = false;

  let canvasEl: HTMLCanvasElement | null = null;
  let bakedSheet: BakedPetSheet | null = null;
  let isBaking = false;
  let animRafId: number | null = null;
  let lastTime = 0;

  // El controlador necesita la biblioteca de clips de la especie (sin ella el constructor lanza
  // al resolver 'idle' y el componente no llega a montarse).
  const initialLib = getAnimLibrary(pet?.species?.id || pet?.species?.spriteKey || 'ignisaur');
  const controller = new AnimationController(initialLib.library, initialLib.aliases);

  $: speciesKey = pet?.species?.id || pet?.species?.spriteKey || 'ignisaur';
  $: {
    const lib = getAnimLibrary(speciesKey);
    controller.setLibrary(lib.library, lib.aliases);
  }
  $: controller.setBase(resolveBaseState(pet));
  $: patternKey = pet?.pattern?.id || 'plain';
  $: isSleeping = pet?.sleeping || false;
  $: isShiny = pet?.shiny || false;
  $: visualSeed = pet?.visualSeed ?? 1337;
  $: palette = pet?.palette || { primary: '#E25822', secondary: '#F3C544', accent: '#6D1600' };
  /** Etapa evolutiva: cada una tiene su hoja (baby, juvenile, adult, final). */
  $: stage = pet?.stage ?? null;

  $: activeAnim = isSleeping ? 'sleep' : anim;

  $: if (pet && (speciesKey || patternKey || palette || visualSeed || stage)) {
    triggerBake();
  }

  let pendingBake = false;
  async function triggerBake() {
    if (isBaking) {
      pendingBake = true; // los datos cambiaron mientras se horneaba: repetir al terminar
      return;
    }
    isBaking = true;
    pendingBake = false;
    try {
      bakedSheet = await bakePetSpriteSheet(
        speciesKey,
        patternKey,
        palette,
        visualSeed,
        isShiny,
        stage
      );
    } catch (err) {
      console.warn('[PetMiniAvatar] Error horneando sprite:', err);
      bakedSheet = null;
    } finally {
      isBaking = false;
      if (pendingBake) triggerBake();
    }
  }

  // Fallback SVG
  $: baseSvg = getPetSvg(speciesKey, activeAnim);
  $: patternSvg = getPatternSvg(patternKey);
  $: accentColor = palette.secondary || palette.accent || '#FFFFFF';

  function loop(time: number) {
    const dt = lastTime ? Math.min(time - lastTime, 250) : 16;
    lastTime = time;

    // 'idle'/'sleep' son estados base; el resto (walk…) se reproduce como movimiento
    controller.setMotion(isSleeping || anim === 'idle' ? null : anim);
    const frameState = controller.update(dt);

    if (canvasEl && bakedSheet) {
      const ctx = canvasEl.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, size, size);
        const frame = bakedSheet.getFrame(frameState.name, frameState.frame);
        ctx.drawImage(
          bakedSheet.canvas,
          frame.sx, frame.sy, frame.sw, frame.sh,
          0, 0, size, size
        );
      }
    }

    animRafId = requestAnimationFrame(loop);
  }

  onMount(() => {
    animRafId = requestAnimationFrame(loop);
  });

  onDestroy(() => {
    if (animRafId !== null) cancelAnimationFrame(animRafId);
  });
</script>

{#if interactive}
  <button
    type="button"
    class="pet-mini-avatar interactive"
    class:draggable
    draggable={draggable}
    on:dragstart
    on:click
    aria-label={pet?.nickname || speciesKey}
    style="width: {size}px; height: {size}px;"
  >
    {#if bakedSheet}
      <canvas
        bind:this={canvasEl}
        width={size}
        height={size}
        class="avatar-canvas"
      ></canvas>
    {:else}
      <div class="svg-fallback" style="width: {size}px; height: {size}px;">
        <div class="svg-base">{@html baseSvg}</div>
        {#if patternSvg}
          <div class="svg-pattern" style="color: {accentColor};">
            {@html patternSvg}
          </div>
        {/if}
      </div>
    {/if}
  </button>
{:else}
  <div
    class="pet-mini-avatar"
    class:draggable
    draggable={draggable}
    on:dragstart
    role="img"
    aria-label={pet?.nickname || speciesKey}
    style="width: {size}px; height: {size}px;"
  >
    {#if bakedSheet}
      <canvas
        bind:this={canvasEl}
        width={size}
        height={size}
        class="avatar-canvas"
      ></canvas>
    {:else}
      <div class="svg-fallback" style="width: {size}px; height: {size}px;">
        <div class="svg-base">{@html baseSvg}</div>
        {#if patternSvg}
          <div class="svg-pattern" style="color: {accentColor};">
            {@html patternSvg}
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .pet-mini-avatar {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    user-select: none;
    touch-action: none;
  }

  /* Sin reset, el WebView pinta el fondo/borde nativo del <button> (el "cuadrado gris") */
  .pet-mini-avatar.interactive {
    appearance: none;
    background: none;
    border: 0;
    padding: 0;
    margin: 0;
    color: inherit;
    border-radius: 50%;
    cursor: pointer;
  }

  .pet-mini-avatar.interactive:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 2px;
  }

  .pet-mini-avatar.draggable {
    cursor: grab;
  }

  .pet-mini-avatar.draggable:active {
    cursor: grabbing;
  }

  .avatar-canvas {
    image-rendering: pixelated;
    image-rendering: crisp-edges;
    pointer-events: none;
  }

  .svg-fallback {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .svg-base, .svg-pattern {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  .svg-base :global(svg),
  .svg-pattern :global(svg) {
    width: 100%;
    height: 100%;
  }
</style>
