<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getPetSvg, getPatternSvg } from '../lib/sprites';
  import EnvironmentalOverlay from './EnvironmentalOverlay.svelte';
  import type { EnvironmentalStatus } from '../lib/environmental';

  export let pet: any;
  export let onPetClick: () => void = () => {};
  /** Texto de la burbuja de chat sobre la mascota (vacío = oculta) */
  export let bubble: string = '';
  /** Estado ambiental (feature 005): hora del día, clima, actividad y festividad. */
  export let environmental: EnvironmentalStatus | null = null;

  let currentAnim: 'idle' | 'walk' | 'eat' | 'happy' | 'sleep' = 'idle';
  let posX = 150;
  let posY = 50;
  let direction = 1; // 1: derecha, -1: izquierda
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;

  let animTimer: any = null;
  let moveInterval: any = null;

  $: speciesKey = pet?.species?.spriteKey || 'ignisaur';
  $: patternKey = pet?.pattern?.id || 'plain';
  $: isSleeping = pet?.sleeping || false;

  $: if (isSleeping) {
    currentAnim = 'sleep';
  } else if (currentAnim === 'sleep' && !isSleeping) {
    currentAnim = 'idle';
  }

  $: baseSvg = getPetSvg(speciesKey, currentAnim);
  $: patternSvg = getPatternSvg(patternKey);
  $: accentColor = pet?.palette?.secondary || pet?.palette?.accent || '#FFFFFF';

  // Variantes ambientales (feature 005): un tinte por tramo del día y clima sobre la mascota.
  $: envVariant = environmental
    ? `env--${environmental.timeOfDay} env--weather-${environmental.weather?.condition ?? 'unknown'}`
    : '';

  export function triggerAnim(anim: 'eat' | 'happy') {
    if (isSleeping) return;
    currentAnim = anim;
    clearTimeout(animTimer);
    animTimer = setTimeout(() => {
      currentAnim = 'idle';
    }, 2500);
  }

  let dragMoved = false;
  const PET_SIZE = 128;

  function handleMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    isDragging = true;
    dragMoved = false;
    dragStartX = e.clientX - posX;
    dragStartY = e.clientY - posY;
    // Mientras se arrastra, el click-through captura todo el viewport para
    // no perder mousemove/mouseup si el cursor se adelanta al sprite.
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
    // Un arrastre no debe contar como clic (abriría el panel)
    if (dragMoved) {
      dragMoved = false;
      return;
    }
    onPetClick();
  }

  onMount(() => {
    // Ciclo de comportamiento de la mascota en pantalla
    moveInterval = setInterval(() => {
      if (isSleeping || isDragging || currentAnim === 'eat') return;

      const actionRoll = Math.random();
      if (actionRoll < 0.45) {
        // Caminar
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
    clearInterval(moveInterval);
    clearTimeout(animTimer);
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  });
</script>

<!-- Contenedor del Sprite con física y arrastre -->
<div
  class="pet-container"
  role="button"
  tabindex="0"
  class:dragging={isDragging}
  style="left: {posX}px; top: {posY}px; transform: scaleX({direction});"
  on:mousedown={handleMouseDown}
  on:click={handleClick}
  on:keydown={(e) => e.key === 'Enter' && onPetClick()}
>
  <div class="sprite-wrapper" class:env={!!envVariant}>
    <!-- Tinte ambiental (feature 005): tramo del día + clima -->
    {#if envVariant}
      <div class="env-tint {envVariant}" aria-hidden="true"></div>
    {/if}

    <!-- SVG Base de la criatura -->
    <div class="svg-base">
      {@html baseSvg}
    </div>

    <!-- Capa de Patrón superpuesta -->
    {#if patternSvg}
      <div class="svg-pattern" style="color: {accentColor};">
        {@html patternSvg}
      </div>
    {/if}

    <!-- Overlay ambiental: accesorios (paraguas, gorro, sombrerito) y micro-momentos -->
    <EnvironmentalOverlay environmental={environmental} />

    <!-- Globo de estado / apodo -->
    {#if bubble}
      <div class="speech" class:below={posY < 110} style="transform: scaleX({direction});">{bubble}</div>
    {/if}

    <div class="pet-badge" style="transform: scaleX({direction});">
      <span class="pet-name">{pet.nickname || pet.species?.name}</span>
      <span class="pet-lvl">Nv. {pet.level || 1}</span>
    </div>

    <!-- Indicador de sueño flotante -->
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
    transition: left 0.4s ease-out, top 0.4s ease-out;
    z-index: 50;
    pointer-events: auto;
  }

  .pet-container:active {
    cursor: grabbing;
  }

  /* Sin interpolación mientras se arrastra: sigue al cursor al instante */
  .pet-container.dragging {
    transition: none;
  }

  .sprite-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
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

  /* Cerca del borde superior de la pantalla la burbuja se muestra debajo */
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

  /* ---------- Tinte ambiental (feature 005) ---------- */
  .env-tint {
    position: absolute;
    inset: -20px;
    border-radius: 50%;
    pointer-events: none;
    z-index: 0;
    opacity: 0.35;
    transition: background 1.2s ease;
  }

  /* Tramo del día */
  .env-tint.env--late_night {
    background: radial-gradient(circle, rgba(30, 41, 90, 0.9) 0%, transparent 70%);
  }
  .env-tint.env--night {
    background: radial-gradient(circle, rgba(30, 41, 90, 0.7) 0%, transparent 70%);
  }
  .env-tint.env--morning {
    background: radial-gradient(circle, rgba(251, 191, 36, 0.7) 0%, transparent 70%);
  }
  .env-tint.env--afternoon {
    background: radial-gradient(circle, rgba(253, 224, 71, 0.6) 0%, transparent 70%);
  }
  .env-tint.env--evening {
    background: radial-gradient(circle, rgba(244, 114, 182, 0.5) 0%, transparent 70%);
  }

  /* Clima (refuerza el tinte del tramo) */
  .env-tint.env--weather-rain,
  .env-tint.env--weather-cloud {
    background: radial-gradient(circle, rgba(71, 85, 105, 0.8) 0%, transparent 70%);
    opacity: 0.5;
  }
  .env-tint.env--weather-snow,
  .env-tint.env--weather-cold {
    background: radial-gradient(circle, rgba(147, 197, 253, 0.85) 0%, transparent 70%);
    opacity: 0.55;
  }
  .env-tint.env--weather-hot {
    background: radial-gradient(circle, rgba(251, 146, 60, 0.7) 0%, transparent 70%);
    opacity: 0.5;
  }
</style>
