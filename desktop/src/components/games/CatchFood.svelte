<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { createRng } from '../../lib/rng';

  export let seed: number;
  export let durationSeconds: number;

  const dispatch = createEventDispatcher<{ finish: { score: number } }>();

  const W = 340;
  const H = 260;
  const BASKET_W = 64;
  const BASKET_Y = H - 34;
  const SPAWN_EVERY = 0.55; // s: ≤ 1.8 objetos/s, por debajo del techo del servidor
  const GOOD = ['🍎', '🍓', '🍇', '🍪'];

  const rng = createRng(seed);
  let basketX = W / 2;
  let items: { id: number; x: number; y: number; vy: number; emoji: string; bad: boolean }[] = [];
  let score = 0;
  let timeLeft = durationSeconds;
  let flash = '';
  let nextId = 0;
  let spawnAcc = 0;
  let raf = 0;
  let last = 0;
  let elapsed = 0;
  let done = false;
  const keys = new Set<string>();

  function spawn() {
    const bad = rng() < 0.2;
    items = [
      ...items,
      {
        id: nextId++,
        x: 16 + rng() * (W - 32),
        y: -16,
        vy: 90 + rng() * 70,
        emoji: bad ? '🪨' : GOOD[Math.floor(rng() * GOOD.length)],
        bad,
      },
    ];
  }

  function frame(ts: number) {
    if (done) return;
    if (!last) last = ts;
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    elapsed += dt;
    timeLeft = Math.max(0, durationSeconds - elapsed);

    if (keys.has('ArrowLeft')) basketX -= 280 * dt;
    if (keys.has('ArrowRight')) basketX += 280 * dt;
    basketX = Math.min(W - BASKET_W / 2, Math.max(BASKET_W / 2, basketX));

    spawnAcc += dt;
    while (spawnAcc >= SPAWN_EVERY) {
      spawnAcc -= SPAWN_EVERY;
      spawn();
    }

    const remaining = [];
    for (const it of items) {
      it.y += it.vy * dt;
      const caught =
        it.y >= BASKET_Y - 8 && it.y <= BASKET_Y + 18 && Math.abs(it.x - basketX) < BASKET_W / 2 + 6;
      if (caught) {
        if (it.bad) {
          score = Math.max(0, score - 1);
          flash = '-1';
        } else {
          score += 1;
          flash = '+1';
        }
        setTimeout(() => (flash = ''), 250);
      } else if (it.y < H + 20) {
        remaining.push(it);
      }
    }
    items = remaining;

    if (elapsed >= durationSeconds) return end();
    raf = requestAnimationFrame(frame);
  }

  function end() {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    dispatch('finish', { score });
  }

  function onMove(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    basketX = e.clientX - r.left;
  }
  const down = (e: KeyboardEvent) => keys.add(e.key);
  const up = (e: KeyboardEvent) => keys.delete(e.key);

  onMount(() => {
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    raf = requestAnimationFrame(frame);
  });
  onDestroy(() => {
    done = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
  });
</script>

<div class="hud"><span>⏱ {Math.ceil(timeLeft)}s</span><span class="score">⭐ {score} <em>{flash}</em></span></div>
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="arena" style="width:{W}px;height:{H}px" on:mousemove={onMove}>
  {#each items as it (it.id)}
    <span class="item" style="left:{it.x}px;top:{it.y}px">{it.emoji}</span>
  {/each}
  <span class="basket" style="left:{basketX}px;top:{BASKET_Y}px">🧺</span>
</div>
<p class="hint">Mueve el ratón (o ← →) para atrapar la comida. ¡Esquiva las piedras!</p>

<style>
  .hud { display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 6px; }
  .score em { color: #38bdf8; font-style: normal; display: inline-block; min-width: 24px; }
  .arena {
    position: relative; overflow: hidden; border-radius: 12px; cursor: none;
    background: linear-gradient(180deg, rgba(56, 189, 248, 0.12), rgba(15, 23, 42, 0.6));
    border: 1px solid rgba(255, 255, 255, 0.12);
  }
  .item, .basket { position: absolute; transform: translate(-50%, -50%); font-size: 26px; pointer-events: none; }
  .basket { font-size: 38px; }
  .hint { font-size: 11px; opacity: 0.65; margin: 6px 0 0; text-align: center; }
</style>
