<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { BallState } from '../lib/toys/toyPhysics';

  export let ball: BallState;
  export let isGrabbed: boolean = false;

  const dispatch = createEventDispatcher();

  let dragStartX = 0;
  let dragStartY = 0;
  let lastX = 0;
  let lastY = 0;
  let lastTime = 0;
  let rotation = 0;

  $: if (ball.vx !== 0) {
    rotation += (ball.vx * 0.05);
  }

  function handleMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    isGrabbed = true;
    dragStartX = e.clientX - ball.x;
    dragStartY = e.clientY - ball.y;
    lastX = e.clientX;
    lastY = e.clientY;
    lastTime = performance.now();
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    e.stopPropagation();
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isGrabbed) return;
    ball.x = e.clientX - dragStartX;
    ball.y = e.clientY - dragStartY;
    lastX = e.clientX;
    lastY = e.clientY;
    lastTime = performance.now();
  }

  function handleMouseUp(e: MouseEvent) {
    if (!isGrabbed) return;
    isGrabbed = false;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);

    const now = performance.now();
    const dt = Math.max(0.016, (now - lastTime) / 1000);
    const vx = (e.clientX - lastX) / dt;
    const vy = (e.clientY - lastY) / dt;

    dispatch('throw', { vx: vx * 0.7, vy: vy * 0.7 });
  }

  function handleClick(e: MouseEvent) {
    // Si se hace clic simple, darle un saltito simpático
    dispatch('kick', { vx: (Math.random() - 0.5) * 200, vy: -320 });
    e.stopPropagation();
  }
</script>

<div
  class="desktop-ball"
  role="button"
  tabindex="0"
  class:grabbed={isGrabbed}
  style="left: {ball.x}px; top: {ball.y}px; width: {ball.radius * 2}px; height: {ball.radius * 2}px;"
  on:mousedown={handleMouseDown}
  on:click={handleClick}
  on:keydown={(e) => e.key === 'Enter' && handleClick(e as any)}
  title="Pelotita de juego (arrástrala para lanzar o haz clic para patear)"
>
  <div class="ball-sphere" style="transform: rotate({rotation}deg);">
    <div class="ball-pattern"></div>
    <div class="ball-highlight"></div>
  </div>
  <div class="ball-shadow"></div>
</div>

<style>
  .desktop-ball {
    position: fixed;
    pointer-events: auto;
    z-index: 92;
    cursor: grab;
    user-select: none;
    touch-action: none;
  }
  .desktop-ball.grabbed {
    cursor: grabbing;
    z-index: 95;
  }

  .ball-sphere {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #ff6b81, #ee5253 60%, #b33939 100%);
    border: 1.5px solid #222;
    box-shadow: inset -2px -3px 5px rgba(0, 0, 0, 0.35);
    overflow: hidden;
    transition: transform 0.05s linear;
  }

  .ball-pattern {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: repeating-linear-gradient(
      45deg,
      transparent,
      transparent 6px,
      rgba(255, 235, 167, 0.75) 6px,
      rgba(255, 235, 167, 0.75) 12px
    );
    opacity: 0.85;
  }

  .ball-highlight {
    position: absolute;
    top: 15%;
    left: 20%;
    width: 25%;
    height: 25%;
    background: rgba(255, 255, 255, 0.85);
    border-radius: 50%;
    filter: blur(1px);
    pointer-events: none;
  }

  .ball-shadow {
    position: absolute;
    bottom: -6px;
    left: 10%;
    width: 80%;
    height: 6px;
    background: rgba(0, 0, 0, 0.25);
    border-radius: 50%;
    filter: blur(2px);
    pointer-events: none;
    z-index: -1;
  }
</style>
