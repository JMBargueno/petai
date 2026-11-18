<script lang="ts">
  import Ico from '../Ico.svelte';
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { createRng } from '../../lib/rng';

  export let seed: number;
  export let durationSeconds: number;

  const dispatch = createEventDispatcher<{ finish: { score: number } }>();

  const W = 340;
  const H = 260;
  const LIFETIME_MS = 900;
  const FAST_MS = 400;
  const rng = createRng(seed);

  let target: { x: number; y: number; shownAt: number } | null = null;
  let score = 0;
  let hits = 0;
  let misses = 0;
  let timeLeft = durationSeconds;
  let done = false;
  let timer: any;
  let spawnTimer: any;
  let hideTimer: any;
  let start = 0;

  function scheduleSpawn() {
    // Cada 1.0–1.4 s: como mucho 1 objetivo/s × 2 puntos = techo del servidor
    spawnTimer = setTimeout(() => {
      if (done) return;
      target = { x: 28 + rng() * (W - 56), y: 28 + rng() * (H - 56), shownAt: performance.now() };
      hideTimer = setTimeout(() => {
        if (target) misses += 1;
        target = null;
      }, LIFETIME_MS);
      scheduleSpawn();
    }, 1000 + rng() * 400);
  }

  function hit() {
    if (!target || done) return;
    const reaction = performance.now() - target.shownAt;
    score += reaction < FAST_MS ? 2 : 1;
    hits += 1;
    target = null;
    clearTimeout(hideTimer);
  }

  function end() {
    if (done) return;
    done = true;
    clearInterval(timer);
    clearTimeout(spawnTimer);
    clearTimeout(hideTimer);
    dispatch('finish', { score });
  }

  onMount(() => {
    start = Date.now();
    scheduleSpawn();
    timer = setInterval(() => {
      timeLeft = Math.max(0, durationSeconds - (Date.now() - start) / 1000);
      if (timeLeft <= 0) end();
    }, 100);
  });
  onDestroy(() => {
    done = true;
    clearInterval(timer);
    clearTimeout(spawnTimer);
    clearTimeout(hideTimer);
  });
</script>

<div class="hud"><span><Ico n="timer" /> {Math.ceil(timeLeft)}s</span><span><Ico n="star" /> {score} · aciertos {hits}/{hits + misses}</span></div>
<div class="arena" style="width:{W}px;height:{H}px">
  {#if target}
    <button class="target" style="left:{target.x}px;top:{target.y}px" on:mousedown={hit} aria-label="Objetivo">🎯</button>
  {/if}
</div>
<p class="hint">Pulsa el objetivo en cuanto aparezca. Menos de 0,4 s = ¡doble puntuación!</p>

<style>
  .hud { display: flex; justify-content: space-between; font-weight: 700; margin-bottom: var(--space-2); }
  .arena {
    position: relative; overflow: hidden; border-radius: var(--radius-2xl);
    background: radial-gradient(circle at 50% 40%, rgba(244, 114, 182, 0.12), var(--surface-2));
    border: 1px solid var(--line-soft);
  }
  .target {
    position: absolute; transform: translate(-50%, -50%); font-size: 40px;
    background: none; border: none; cursor: crosshair; padding: 0; animation: pop 0.15s ease-out;
  }
  @keyframes pop {
    from { transform: translate(-50%, -50%) scale(0.4); }
    to { transform: translate(-50%, -50%) scale(1); }
  }
  .hint { font-size: var(--text-caption); opacity: 0.65; margin: var(--space-2) 0 0; text-align: center; }
</style>
