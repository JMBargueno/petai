<script lang="ts">
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

<div class="hud"><span>⏱ {Math.ceil(timeLeft)}s</span><span>⭐ {score} · aciertos {hits}/{hits + misses}</span></div>
<div class="arena" style="width:{W}px;height:{H}px">
  {#if target}
    <button class="target" style="left:{target.x}px;top:{target.y}px" on:mousedown={hit} aria-label="Objetivo">🎯</button>
  {/if}
</div>
<p class="hint">Pulsa el objetivo en cuanto aparezca. Menos de 0,4 s = ¡doble puntuación!</p>

<style>
  .hud { display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 6px; }
  .arena {
    position: relative; overflow: hidden; border-radius: 12px;
    background: radial-gradient(circle at 50% 40%, rgba(244, 114, 182, 0.12), rgba(15, 23, 42, 0.6));
    border: 1px solid rgba(255, 255, 255, 0.12);
  }
  .target {
    position: absolute; transform: translate(-50%, -50%); font-size: 40px;
    background: none; border: none; cursor: crosshair; padding: 0; animation: pop 0.15s ease-out;
  }
  @keyframes pop {
    from { transform: translate(-50%, -50%) scale(0.4); }
    to { transform: translate(-50%, -50%) scale(1); }
  }
  .hint { font-size: 11px; opacity: 0.65; margin: 6px 0 0; text-align: center; }
</style>
