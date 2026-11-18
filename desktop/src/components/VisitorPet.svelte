<script lang="ts">
  /**
   * La mascota de un amigo de visita: se dibuja con la misma línea de sprites que la propia
   * mascota (hoja horneada + AnimationController), pero con la identidad que trae el backend
   * (PetIdentity). Si la especie no resuelve localmente, usa la especie por defecto.
   */
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { bakePetSpriteSheet, getAnimLibrary, getPetSvg, type BakedPetSheet } from '../lib/sprites';
  import { AnimationController } from '../lib/animation/AnimationController';
  import { resolveVisitorSpriteKey, visitorSeed } from '../lib/visitors';
  import type { HabitatVisitor } from '../lib/api';
  import EffectLayer from './EffectLayer.svelte';
  import { EffectPlayer, flowPalette, portalNexo, speciesElement } from '@pockai/scene/effects';

  export let visitor: HabitatVisitor;
  /** Se va del hábitat: vuelve a cruzar su portal y avisa con `gone` al terminar. */
  export let leaving = false;

  const dispatch = createEventDispatcher<{ gone: string }>();
  const reducedMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  /** El amigo llega y se va por su propio portal de hebras, en el color de SU Flujo (LORE §8). */
  const portalPalette = flowPalette(speciesElement(visitor.pet?.speciesId));
  /** Visible fuera del portal: oculto hasta que lo cruza al llegar, y de nuevo al irse. */
  let shown = false;
  let anim: '' | 'in' | 'out' = '';
  let portal: { player: EffectPlayer; id: number } | null = null;
  let portalSeq = 0;
  let left = false;
  const CROSS_MS = reducedMotion ? 220 : 440;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  function openPortal(onHold: (p: EffectPlayer) => Promise<void>, onDone: () => void) {
    const player = new EffectPlayer(reducedMotion ? portalNexo.reducedPhases : portalNexo.phases, (phase) => {
      if (phase === 'hold') void onHold(player);
      if (phase === 'done') {
        portal = null;
        onDone();
      }
    });
    player.start(performance.now());
    portal = { player, id: ++portalSeq };
  }

  function arrive() {
    openPortal(
      async (player) => {
        shown = true;
        anim = 'in';
        await wait(CROSS_MS);
        anim = '';
        player.release(performance.now());
      },
      () => {},
    );
  }

  function depart() {
    openPortal(
      async (player) => {
        anim = 'out';
        await wait(CROSS_MS);
        shown = false;
        anim = '';
        player.release(performance.now());
      },
      () => {
        // Si volvió a entrar mientras cruzaba, vuelve a salir del portal en vez de irse
        if (leaving) dispatch('gone', visitor.visitorId);
        else {
          left = false;
          arrive();
        }
      },
    );
  }

  $: if (leaving && !left) {
    left = true;
    depart();
  }

  // Pixel art (GUIA_ARTISTICA §7.5): 64 px = ×1, escala entera.
  const SIZE = 64;
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
      // Con su etapa evolutiva: un bebé de visita se ve bebé (sin etapa, también bebé)
      sheet = await bakePetSpriteSheet(speciesKey, 'plain', palette, seed, false, visitor.pet?.stage);
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
    arrive();
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

<!-- Llega y se va por un portal de hebras con el color de su Flujo -->
<div class="visitor" class:hidden={!shown} class:cross-in={anim === 'in'} class:cross-out={anim === 'out'}>
  {#if visitor.message && shown && !leaving}
    <!-- Texto plano (sin {@html}): Svelte lo escapa -->
    <div class="v-bubble">{visitor.message}</div>
  {/if}
  <div class="v-sprite">
    {#if portal}
      {#key portal.id}
        <!-- A ×1, como el propio visitante: un portal a la medida de una mascota de 64 px -->
        <EffectLayer def={portalNexo} player={portal.player} x={SIZE / 2} y={SIZE - 2} scale={1}
          palette={portalPalette} seed={seed} reduced={reducedMotion} />
      {/key}
    {/if}
    {#if sheet}
      <canvas bind:this={canvas} width={SIZE} height={SIZE} class="v-canvas" aria-hidden="true"></canvas>
    {:else}
      <div class="v-svg" aria-hidden="true">{@html baseSvg}</div>
    {/if}
  </div>
  <span class="v-label">«{visitor.visitorName}» está de visita</span>
</div>

<style>
  .visitor {
    position: absolute;
    left: -86px;
    bottom: 0;
    z-index: calc(var(--z-pet) - 1);
    width: 64px;
    display: flex;
    flex-direction: column;
    align-items: center;
    pointer-events: none;
  }
  .v-bubble {
    position: relative;
    margin-bottom: var(--space-2);
    width: max-content;
    max-width: 160px;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-2xl);
    background: var(--surface);
    border: 1px solid var(--line-soft);
    font-size: var(--text-caption);
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
  /* Hasta cruzar el portal no se ven ni el sprite, ni su bocadillo, ni su nombre */
  .visitor.hidden .v-canvas,
  .visitor.hidden .v-svg,
  .visitor.hidden .v-label {
    visibility: hidden;
  }
  .v-sprite {
    position: relative;
    width: 64px;
    height: 64px;
  }
  .v-sprite :global(.fx-layer) {
    z-index: 0;
  }
  .v-canvas,
  .v-svg {
    position: relative;
    z-index: 1;
  }
  .visitor.cross-in .v-canvas,
  .visitor.cross-in .v-svg {
    transform-origin: 50% 70%;
    animation: crossPortal 0.44s ease-out reverse both;
  }
  .visitor.cross-out .v-canvas,
  .visitor.cross-out .v-svg {
    transform-origin: 50% 70%;
    animation: crossPortal 0.44s ease-in forwards;
  }
  @keyframes crossPortal {
    from {
      transform: translateY(0) scale(1);
      filter: brightness(1);
      opacity: 1;
    }
    to {
      transform: translateY(-16px) scale(0.12);
      filter: brightness(2.4);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .visitor.cross-in .v-canvas,
    .visitor.cross-in .v-svg,
    .visitor.cross-out .v-canvas,
    .visitor.cross-out .v-svg {
      animation-name: crossFade;
    }
    @keyframes crossFade {
      from { opacity: 1; }
      to { opacity: 0; }
    }
  }
  .v-canvas {
    width: 64px;
    height: 64px;
    image-rendering: pixelated;
  }
  .v-svg {
    width: 64px;
    height: 64px;
  }
  .v-svg :global(svg) {
    width: 100%;
    height: 100%;
  }
  .v-label {
    margin-top: 2px;
    max-width: 130px;
    padding: 2px var(--space-2);
    border-radius: var(--radius-pills);
    background: color-mix(in srgb, var(--surface) 88%, transparent);
    border: 1px solid var(--line-soft);
    font-size: var(--text-caption);
    font-weight: 600;
    color: var(--ink-muted);
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
