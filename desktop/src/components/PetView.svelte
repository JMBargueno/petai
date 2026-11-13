<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getPetSvg, getPatternSvg } from '../lib/sprites';

  export let pet: any;
  export let onPetClick: () => void = () => {};

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

  export function triggerAnim(anim: 'eat' | 'happy') {
    if (isSleeping) return;
    currentAnim = anim;
    clearTimeout(animTimer);
    animTimer = setTimeout(() => {
      currentAnim = 'idle';
    }, 2500);
  }

  function handleMouseDown(e: MouseEvent) {
    isDragging = true;
    dragStartX = e.clientX - posX;
    dragStartY = e.clientY - posY;
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDragging) return;
    posX = e.clientX - dragStartX;
    posY = Math.max(10, e.clientY - dragStartY);
  }

  function handleMouseUp() {
    isDragging = false;
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
  style="left: {posX}px; top: {posY}px; transform: scaleX({direction});"
  on:mousedown={handleMouseDown}
  on:click={onPetClick}
  on:keydown={(e) => e.key === 'Enter' && onPetClick()}
>
  <div class="sprite-wrapper">
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

    <!-- Globo de estado / apodo -->
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
