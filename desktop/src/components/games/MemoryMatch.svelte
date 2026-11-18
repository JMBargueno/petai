<script lang="ts">
  import Ico from '../Ico.svelte';
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
  let flipBack: ReturnType<typeof setTimeout> | null = null;
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
        flipBack = setTimeout(() => {
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
    if (flipBack) clearTimeout(flipBack);
  });
</script>

<div class="hud"><span><Ico n="timer" /> {Math.ceil(timeLeft)} s</span><span role="status"><Ico n="cards" /> {pairs}/8 parejas · fallos {misses}</span></div>
<div class="grid">
  {#each deck as emoji, i}
    <button
      class="card"
      class:up={flipped.includes(i) || matched.has(i)}
      class:ok={matched.has(i)}
      disabled={matched.has(i)}
      aria-label="Carta {i + 1}: {matched.has(i) ? `${emoji}, emparejada` : flipped.includes(i) ? emoji : 'boca abajo'}"
      on:click={() => flip(i)}
    >
      {#if flipped.includes(i) || matched.has(i)}{emoji}{:else}❔{/if}
    </button>
  {/each}
</div>
<p class="hint">Encuentra las 8 parejas. Cuanto más rápido y con menos fallos, más puntos.</p>

<style>
  .hud { display: flex; justify-content: space-between; font-weight: 700; margin-bottom: var(--space-2); }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-2); width: 340px; }
  .card {
    aspect-ratio: 1; font-size: 28px; border-radius: var(--radius-2xl); cursor: pointer;
    background: var(--surface-2); border: 1px solid var(--line-soft); color: inherit;
    transition: transform var(--dur-1), background var(--dur-1);
  }
  .card:hover { transform: translateY(-2px); }
  .card.up { background: color-mix(in srgb, var(--accent) 18%, var(--surface)); }
  .card.ok { background: color-mix(in srgb, var(--success) 22%, var(--surface)); border-color: var(--success); }
  .hint { font-size: var(--text-caption); opacity: 0.65; margin: var(--space-2) 0 0; text-align: center; }
</style>
