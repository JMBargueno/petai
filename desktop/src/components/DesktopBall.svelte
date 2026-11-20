<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { calculateThrowVelocity, type PointerSample } from '../lib/physics/petPhysics';
  import { BALL_MAX_THROW_SPEED, type BallState } from '../lib/toys/toyPhysics';

  export let ball: BallState;

  /**
   * Eventos: `grab` al agarrarla, `drag {x,y}` mientras se arrastra, `throw {vx,vy}` al soltarla
   * y `kick {vx,vy}` con un clic simple. El padre es el dueño del estado de la pelota.
   */
  const dispatch = createEventDispatcher<{
    grab: void;
    drag: { x: number; y: number };
    throw: { vx: number; vy: number };
    kick: { vx: number; vy: number };
  }>();

  /** Píxeles de movimiento a partir de los cuales el gesto es un arrastre y no un clic. */
  const DRAG_THRESHOLD = 4;

  let isGrabbed = false;
  let dragMoved = false;
  let downX = 0;
  let downY = 0;
  let dragStartX = 0;
  let dragStartY = 0;
  let samples: PointerSample[] = [];

  // Rotación según la distancia recorrida (rodar sin deslizar): Δx / r radianes
  let rotation = 0;
  let prevX = ball.x;
  $: {
    const dx = ball.x - prevX;
    prevX = ball.x;
    rotation += (dx / ball.radius) * (180 / Math.PI);
  }

  function handleMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    isGrabbed = true;
    dragMoved = false;
    downX = e.clientX;
    downY = e.clientY;
    dragStartX = e.clientX - ball.x;
    dragStartY = e.clientY - ball.y;
    samples = [{ x: e.clientX, y: e.clientY, time: performance.now() }];
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    dispatch('grab');
    e.stopPropagation();
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isGrabbed) return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > DRAG_THRESHOLD) dragMoved = true;
    samples.push({ x: e.clientX, y: e.clientY, time: performance.now() });
    if (samples.length > 20) samples.shift();
    dispatch('drag', { x: e.clientX - dragStartX, y: e.clientY - dragStartY });
  }

  function stopListening() {
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  }

  function handleMouseUp() {
    if (!isGrabbed) return;
    isGrabbed = false;
    stopListening();

    const { vx, vy } = dragMoved
      ? calculateThrowVelocity(samples, {
          releaseTime: performance.now(),
          maxSpeed: BALL_MAX_THROW_SPEED,
        })
      : { vx: 0, vy: 0 };
    dispatch('throw', { vx, vy });
  }

  function kickRandom() {
    // Clic simple: un saltito simpático
    dispatch('kick', { vx: (Math.random() - 0.5) * 200, vy: -320 });
  }

  function handleClick(e: MouseEvent) {
    e.stopPropagation();
    // El clic que sigue a un arrastre no es una patada
    if (dragMoved) {
      dragMoved = false;
      return;
    }
    kickRandom();
  }

  onDestroy(stopListening);
</script>

<div
  class="desktop-ball"
  role="button"
  tabindex="0"
  class:grabbed={isGrabbed}
  style="left: {ball.x}px; top: {ball.y}px; width: {ball.radius * 2}px; height: {ball.radius * 2}px;"
  on:mousedown={handleMouseDown}
  on:click={handleClick}
  on:keydown={(e) => e.key === 'Enter' && kickRandom()}
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
    z-index: calc(var(--z-dock) + 2);
    cursor: grab;
    user-select: none;
    touch-action: none;
  }
  .desktop-ball.grabbed {
    cursor: grabbing;
    z-index: calc(var(--z-dock) + 5);
  }

  .ball-sphere {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #ff6b81, #ee5253 60%, #b33939 100%); /* color-ok: juguete pintado */
    border: 1.5px solid #222; /* color-ok: juguete pintado */
    box-shadow: inset -2px -3px 5px rgba(0, 0, 0, 0.35); /* color-ok: juguete pintado */
    overflow: hidden;
  }

  .ball-pattern {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: repeating-linear-gradient(
      45deg,
      transparent,
      transparent 6px,
      rgba(255, 235, 167, 0.75) 6px, /* color-ok: juguete pintado */
      rgba(255, 235, 167, 0.75) 12px /* color-ok: juguete pintado */
    );
    opacity: 0.85;
  }

  .ball-highlight {
    position: absolute;
    top: 15%;
    left: 20%;
    width: 25%;
    height: 25%;
    background: rgba(255, 255, 255, 0.85); /* color-ok: juguete pintado */
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
    background: rgba(0, 0, 0, 0.25); /* color-ok: juguete pintado */
    border-radius: 50%;
    filter: blur(2px);
    pointer-events: none;
    z-index: var(--z-below);
  }
</style>
