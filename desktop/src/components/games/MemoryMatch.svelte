<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { createRng, shuffle } from '../../lib/rng';

  export let seed: number;
  export let durationSeconds: number;

  const dispatch = createEventDispatcher<{ finish: { score: number } }>();

  const EMOJIS = ['🐉', '🌿', '🌊', '🔥', '⭐', '🌙', '🍄', '💎'];
  const rng = createRng(seed);
  const deck = shuffle([...EMOJIS, ...EMOJIS], rng);

  let flipped: number[] = [];
  let matched = new Set<number>();
  let locked = false;
  let timeLeft = durationSeconds;
  let misses = 0;
  let done = false;
  let timer: any;
  let start = 0;

  $: pairs = matched.size / 2;

  function flip(i: number) {
    if (done || locked || flipped.includes(i) || matched.has(i)) return;
    flipped = [...flipped, i];
    if (flipped.length === 2) {
      const [a, b] = flipped;
      if (deck[a] === deck[b]) {
        matched = new Set([...matched, a, b]);
        flipped = [];
        if (matched.size === deck.length) end();
      } else {
        misses += 1;
        locked = true;
        setTimeout(() => {
          flipped = [];
          locked = false;
        }, 700);
      }
    }
  }

  function end() {
    if (done) return;
    done = true;
    clearInterval(timer);
    // 2 puntos por pareja + bonus de rapidez (hasta 8) − penalización por fallos
    const bonus = matched.size === deck.length ? Math.min(8, Math.floor(timeLeft / 8)) : 0;
    const score = Math.max(0, pairs * 2 + bonus - Math.floor(misses / 3));
    dispatch('finish', { score });
  }

  onMount(() => {
    start = Date.now();
    timer = setInterval(() => {
      timeLeft = Math.max(0, durationSeconds - (Date.now() - start) / 1000);
      if (timeLeft <= 0) end();
    }, 200);
  });
  onDestroy(() => {
    done = true;
    clearInterval(timer);
  });
</script>

<div class="hud"><span>⏱ {Math.ceil(timeLeft)}s</span><span>🃏 {pairs}/8 · fallos {misses}</span></div>
<div class="grid">
  {#each deck as emoji, i}
    <button
      class="card"
      class:up={flipped.includes(i) || matched.has(i)}
      class:ok={matched.has(i)}
      on:click={() => flip(i)}
    >
      {#if flipped.includes(i) || matched.has(i)}{emoji}{:else}❔{/if}
    </button>
  {/each}
</div>
<p class="hint">Encuentra las 8 parejas. Cuanto más rápido y con menos fallos, más puntos.</p>

<style>
  .hud { display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 6px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; width: 340px; }
  .card {
    aspect-ratio: 1; font-size: 28px; border-radius: 10px; cursor: pointer;
    background: rgba(30, 41, 59, 0.9); border: 1px solid rgba(255, 255, 255, 0.15); color: inherit;
    transition: transform 0.15s, background 0.15s;
  }
  .card:hover { transform: translateY(-2px); }
  .card.up { background: rgba(56, 189, 248, 0.18); }
  .card.ok { background: rgba(34, 197, 94, 0.22); border-color: rgba(34, 197, 94, 0.5); }
  .hint { font-size: 11px; opacity: 0.65; margin: 8px 0 0; text-align: center; }
</style>
