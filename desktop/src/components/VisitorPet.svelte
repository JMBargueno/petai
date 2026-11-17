<script lang="ts">
  /**
   * La mascota de un amigo de visita: se dibuja con la misma línea de sprites que la propia
   * mascota (hoja horneada + AnimationController), pero con la identidad que trae el backend
   * (PetIdentity). Si la especie no resuelve localmente, usa la especie por defecto.
   */
  import { onMount, onDestroy } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { bakePetSpriteSheet, getAnimLibrary, getPetSvg, type BakedPetSheet } from '../lib/sprites';
  import { AnimationController } from '../lib/animation/AnimationController';
  import { resolveVisitorSpriteKey, visitorSeed } from '../lib/visitors';
  import type { HabitatVisitor } from '../lib/api';

  export let visitor: HabitatVisitor;

  const SIZE = 72;
  const speciesKey = resolveVisitorSpriteKey(visitor.pet);
  /** El visitante no trae paleta ni patrón: seed determinista por jugador y paleta por defecto. */
  const palette = { primary: '#8F7BD8', secondary: '#F3C544', accent: '#2D2A4A' };
  const seed = visitorSeed(visitor.visitorId);

  const { library, aliases } = getAnimLibrary(speciesKey);
  const controller = new AnimationController(library, aliases);

  let canvas: HTMLCanvasElement | null = null;
  let sheet: BakedPetSheet | null = null;
  let rafId: number | null = null;
  let lastTime = 0;
  let actionTimer: ReturnType<typeof setInterval> | null = null;

  $: baseSvg = getPetSvg(speciesKey);

  async function bake() {
    try {
      sheet = await bakePetSpriteSheet(speciesKey, 'plain', palette, seed);
    } catch (err) {
      console.warn('Visita: sin sprite, se queda el SVG base:', err);
      sheet = null;
    }
  }

  /** Bucle de render: dibuja el frame actual del controller en el mini-canvas. */
  function renderLoop(time: number) {
    const dt = lastTime ? Math.min(time - lastTime, 250) : 16;
    lastTime = time;
    const frameState = controller.update(dt);
    if (canvas && sheet) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const frame = sheet.getFrame(frameState.name, frameState.frame);
        ctx.clearRect(0, 0, SIZE, SIZE);
        ctx.drawImage(sheet.canvas, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, SIZE, SIZE);
      }
    }
    rafId = requestAnimationFrame(renderLoop);
  }

  onMount(() => {
    void bake();
    rafId = requestAnimationFrame(renderLoop);
    // Vida tranquila: de vez en cuando saluda o mira alrededor (clipes que existen en todas las hojas).
    actionTimer = setInterval(() => {
      if (Math.random() < 0.5) controller.play('happy');
      else controller.play('idle_alt');
    }, 5000);
  });

  onDestroy(() => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    if (actionTimer) clearInterval(actionTimer);
  });
</script>

<!-- Entrada suave (cae desde arriba) y salida con fundido al dejar el hábitat -->
<div class="visitor" in:fly={{ y: 20, duration: 550, delay: 150 }} out:fade={{ duration: 400 }}>
  {#if visitor.message}
    <!-- Texto plano (sin {@html}): Svelte lo escapa -->
    <div class="v-bubble">{visitor.message}</div>
  {/if}
  {#if sheet}
    <canvas bind:this={canvas} width={SIZE} height={SIZE} class="v-canvas" aria-hidden="true"></canvas>
  {:else}
    <div class="v-svg" aria-hidden="true">{@html baseSvg}</div>
  {/if}
  <span class="v-label">«{visitor.visitorName}» está de visita</span>
</div>

<style>
  .visitor {
    position: absolute;
    left: -86px;
    bottom: 0;
    z-index: 49;
    width: 72px;
    display: flex;
    flex-direction: column;
    align-items: center;
    pointer-events: none;
  }
  .v-bubble {
    position: relative;
    margin-bottom: 6px;
    width: max-content;
    max-width: 160px;
    padding: 4px 8px;
    border-radius: var(--radius-2xl);
    background: var(--surface);
    border: 1px solid var(--line-soft);
    font-size: 11px;
    line-height: 1.3;
    color: var(--ink);
    text-align: center;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 8;
    line-clamp: 8;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .v-canvas {
    width: 72px;
    height: 72px;
    image-rendering: auto;
  }
  .v-svg {
    width: 72px;
    height: 72px;
  }
  .v-svg :global(svg) {
    width: 100%;
    height: 100%;
  }
  .v-label {
    margin-top: 2px;
    max-width: 130px;
    padding: 2px 8px;
    border-radius: var(--radius-pills);
    background: color-mix(in srgb, var(--surface) 88%, transparent);
    border: 1px solid var(--line-soft);
    font-size: 10px;
    font-weight: 600;
    color: var(--ink-muted);
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
