<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    bakePetSpriteSheet,
    getPetSvg,
    getPatternSvg,
    type BakedPetSheet
  } from '../lib/sprites';

  export let pet: any;
  export let onPetClick: () => void = () => {};
  /** Texto de la burbuja de chat sobre la mascota (vacío = oculta) */
  export let bubble: string = '';

  let currentAnim = 'idle';
  let posX = 150;
  let posY = 50;
  let direction = 1; // 1: derecha, -1: izquierda
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;

  let animTimer: any = null;
  let moveInterval: any = null;
  let animRafId: number | null = null;

  // Canvas y baking
  let petCanvas: HTMLCanvasElement | null = null;
  let bakedSheet: BakedPetSheet | null = null;
  let isBaking = false;
  let currentFrameIndex = 0;
  let lastFrameTime = 0;

  // Transformaciones procedurales
  let squashScaleX = 1;
  let squashScaleY = 1;
  let recoilOffsetX = 0;
  let isWhiteFlash = false;

  $: speciesKey = pet?.species?.id || pet?.species?.spriteKey || 'ignisaur';
  $: patternKey = pet?.pattern?.id || 'plain';
  $: isSleeping = pet?.sleeping || false;
  $: isShiny = pet?.shiny || false;
  $: visualSeed = pet?.visualSeed ?? 1337;
  $: palette = pet?.palette || { primary: '#E25822', secondary: '#F3C544', accent: '#6D1600' };

  $: if (isSleeping) {
    currentAnim = 'sleep';
  } else if (currentAnim === 'sleep' && !isSleeping) {
    currentAnim = 'idle';
  }

  // Hornear sprite sheet en memoria al cambiar de mascota, paleta o patrón
  $: if (pet && (speciesKey || patternKey || palette || visualSeed)) {
    triggerBake();
  }

  async function triggerBake() {
    if (isBaking) return;
    isBaking = true;
    try {
      bakedSheet = await bakePetSpriteSheet(
        speciesKey,
        patternKey,
        palette,
        visualSeed,
        isShiny
      );
    } catch (err) {
      console.warn('Fallback a SVG: error horneando sprite sheet:', err);
      bakedSheet = null;
    } finally {
      isBaking = false;
    }
  }

  // Fallback SVG legacy
  $: baseSvg = getPetSvg(speciesKey, currentAnim);
  $: patternSvg = getPatternSvg(patternKey);
  $: accentColor = palette.secondary || palette.accent || '#FFFFFF';

  export function triggerAnim(anim: string) {
    if (isSleeping) return;
    currentAnim = anim;
    currentFrameIndex = 0;
    clearTimeout(animTimer);
    animTimer = setTimeout(() => {
      currentAnim = 'idle';
      currentFrameIndex = 0;
    }, 2500);
  }

  export function triggerHurt() {
    recoilOffsetX = -12;
    isWhiteFlash = true;
    setTimeout(() => {
      recoilOffsetX = 0;
      isWhiteFlash = false;
    }, 80);
  }

  let dragMoved = false;
  const PET_SIZE = 128;

  function handleMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    isDragging = true;
    dragMoved = false;
    dragStartX = e.clientX - posX;
    dragStartY = e.clientY - posY;
    document.body.dataset.dragging = '1';
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDragging) return;
    const nx = e.clientX - dragStartX;
    const ny = e.clientY - dragStartY;
    if (Math.abs(nx - posX) + Math.abs(ny - posY) > 0) dragMoved = true;
    posX = Math.min(Math.max(0, nx), window.innerWidth - PET_SIZE);
    posY = Math.min(Math.max(0, ny), window.innerHeight - PET_SIZE);
  }

  function handleMouseUp() {
    isDragging = false;
    delete document.body.dataset.dragging;
  }

  function handleClick() {
    if (dragMoved) {
      dragMoved = false;
      return;
    }

    // Procedural Squash & Stretch al interactuar
    squashScaleX = 1.15;
    squashScaleY = 0.85;
    setTimeout(() => {
      squashScaleX = 0.95;
      squashScaleY = 1.05;
      setTimeout(() => {
        squashScaleX = 1;
        squashScaleY = 1;
      }, 70);
    }, 60);

    onPetClick();
  }

  // Loop de renderizado del Canvas a 60 FPS
  function renderLoop(time: number) {
    if (petCanvas && bakedSheet) {
      const ctx = petCanvas.getContext('2d');
      if (ctx) {
        // Avance de frame cada 150 ms
        if (time - lastFrameTime > 150) {
          currentFrameIndex++;
          lastFrameTime = time;
        }

        ctx.clearRect(0, 0, 128, 128);

        // Recortar frame del sprite sheet horneado
        const frame = bakedSheet.getFrame(currentAnim, currentFrameIndex);
        ctx.drawImage(
          bakedSheet.canvas,
          frame.sx, frame.sy, frame.sw, frame.sh,
          0, 0, 128, 128
        );

        // Efecto Flash blanco en daño
        if (isWhiteFlash) {
          ctx.save();
          ctx.globalCompositeOperation = 'source-atop';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
          ctx.fillRect(0, 0, 128, 128);
          ctx.restore();
        }

        // Efecto Shiny: Franja especular animada cada 4s
        if (isShiny) {
          const shinyPeriod = (time % 4000) / 4000; // 0.0 a 1.0 cada 4s
          if (shinyPeriod < 0.35) { // La franja cruza en 1.4s
            const progress = shinyPeriod / 0.35;
            const bandX = progress * 240 - 60;

            ctx.save();
            ctx.globalCompositeOperation = 'source-atop';
            const grad = ctx.createLinearGradient(bandX, 0, bandX + 40, 128);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
            grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.45)');
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 128, 128);
            ctx.restore();
          }
        }
      }
    }
    animRafId = requestAnimationFrame(renderLoop);
  }

  onMount(() => {
    // Inicializar loop de animación
    animRafId = requestAnimationFrame(renderLoop);

    // Ciclo de comportamiento de la mascota en pantalla
    moveInterval = setInterval(() => {
      if (isSleeping || isDragging || currentAnim === 'eat') return;

      const actionRoll = Math.random();
      if (actionRoll < 0.45) {
        currentAnim = 'walk';
        const step = 25 * direction;
        const windowWidth = window.innerWidth || 800;

        if (posX + step > windowWidth - 140) {
          direction = -1;
        } else if (posX + step < 20) {
          direction = 1;
        }
        posX += 25 * direction;

        setTimeout(() => {
          if (!isSleeping && currentAnim === 'walk') {
            currentAnim = 'idle';
          }
        }, 800);
      } else if (actionRoll < 0.70) {
        currentAnim = 'idle';
      }
    }, 3000);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  });

  onDestroy(() => {
    if (animRafId !== null) cancelAnimationFrame(animRafId);
    clearInterval(moveInterval);
    clearTimeout(animTimer);
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  });
</script>

<!-- Contenedor del Sprite con física, arrastre y Squash & Stretch procedural -->
<div
  class="pet-container"
  role="button"
  tabindex="0"
  class:dragging={isDragging}
  style="
    left: {posX + recoilOffsetX}px;
    top: {posY}px;
    transform: scaleX({direction}) scale({squashScaleX}, {squashScaleY});
  "
  on:mousedown={handleMouseDown}
  on:click={handleClick}
  on:keydown={(e) => e.key === 'Enter' && onPetClick()}
>
  <div class="sprite-wrapper">
    <!-- Renderizado por Canvas horneado en memoria (In-Memory Baking) -->
    {#if bakedSheet}
      <canvas
        bind:this={petCanvas}
        width="128"
        height="128"
        class="pet-canvas"
      ></canvas>
    {:else}
      <!-- Fallback provisional a SVG mientras se hornea -->
      <div class="svg-base">
        {@html baseSvg}
      </div>
      {#if patternSvg}
        <div class="svg-pattern" style="color: {accentColor};">
          {@html patternSvg}
        </div>
      {/if}
    {/if}

    <!-- Burbuja de chat o estado -->
    {#if bubble}
      <div class="speech" class:below={posY < 110} style="transform: scaleX({direction});">{bubble}</div>
    {/if}

    <div class="pet-badge" style="transform: scaleX({direction});">
      <span class="pet-name">{pet.nickname || pet.species?.name}</span>
      <span class="pet-lvl">Nv. {pet.level || 1}</span>
    </div>

    <!-- Indicador de partículas flotantes -->
    {#if isSleeping}
      <div class="floating-bubble zzz" style="transform: scaleX({direction});">
        💤
      </div>
    {:else if currentAnim === 'happy'}
      <div class="floating-bubble heart" style="transform: scaleX({direction});">
        ✨
      </div>
    {:else if currentAnim === 'eat'}
      <div class="floating-bubble food" style="transform: scaleX({direction});">
        🍎
      </div>
    {/if}
  </div>
</div>

<style>
  .pet-container {
    position: absolute;
    width: 128px;
    height: 128px;
    cursor: grab;
    transition: left 0.4s ease-out, top 0.4s ease-out, transform 0.08s ease-out;
    z-index: 50;
    pointer-events: auto;
    transform-origin: bottom center;
  }

  .pet-container:active {
    cursor: grabbing;
  }

  .pet-container.dragging {
    transition: none;
  }

  .sprite-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .pet-canvas {
    width: 128px;
    height: 128px;
    image-rendering: pixelated;
    image-rendering: -moz-crisp-edges;
    image-rendering: crisp-edges;
    pointer-events: none;
  }

  .svg-base {
    position: absolute;
    top: 0;
    left: 0;
    width: 128px;
    height: 128px;
  }

  .svg-pattern {
    position: absolute;
    top: 0;
    left: 0;
    width: 128px;
    height: 128px;
    pointer-events: none;
    mix-blend-mode: overlay;
  }

  .speech {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    margin-left: -110px;
    width: 220px;
    padding: 8px 12px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.96);
    color: #0f172a;
    font-size: 13px;
    line-height: 1.35;
    text-align: center;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
    pointer-events: none;
    z-index: 60;
  }

  .speech.below {
    bottom: auto;
    top: calc(100% + 30px);
  }

  .speech.below::after {
    top: auto;
    bottom: 100%;
    border-top-color: transparent;
    border-bottom-color: rgba(255, 255, 255, 0.96);
  }

  .speech::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    margin-left: -6px;
    border: 6px solid transparent;
    border-top-color: rgba(255, 255, 255, 0.96);
  }

  .pet-badge {
    position: absolute;
    bottom: -18px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(15, 23, 42, 0.85);
    backdrop-filter: blur(8px);
    color: #f8fafc;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    display: flex;
    gap: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.15);
    pointer-events: none;
  }

  .pet-lvl {
    color: #fbbf24;
  }

  .floating-bubble {
    position: absolute;
    top: -15px;
    right: 10px;
    font-size: 20px;
    animation: floatUp 1.8s infinite ease-in-out;
    pointer-events: none;
  }

  @keyframes floatUp {
    0%, 100% {
      transform: translateY(0);
      opacity: 0.9;
    }
    50% {
      transform: translateY(-8px);
      opacity: 1;
    }
  }
</style>
