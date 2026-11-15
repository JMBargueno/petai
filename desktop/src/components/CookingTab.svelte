<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { api, type CookingDailyMenu, type CookingStart, type CookingSubmit } from '../lib/api';

  const dispatch = createEventDispatcher();

  export let pet: any = null;

  const INGREDIENT_ICON: Record<string, string> = {
    carrot: '🥕', onion: '🧅', water: '💧', herb: '🌿', crystal: '💎', salt: '🧂', mushroom: '🍄',
    ink: '🦑', rice: '🍚', beef: '🥩', lightning: '⚡', pepper: '🌶️', flour: '🌾', sun_nectar: '🌻',
    butter: '🧈', honey: '🍯', roe: '🟠', seaweed: '🪸', pearl: '🦪', phoenix: '🪶',
    dragon_glass: '🔮', star_dust: '✨', elixir: '🧪',
  };
  const icon = (i: string) => INGREDIENT_ICON[i] ?? '🥄';
  const INGREDIENT_NAME: Record<string, string> = {
    carrot: 'zanahoria', onion: 'cebolla', water: 'agua', herb: 'hierba', crystal: 'cristal', salt: 'sal',
    mushroom: 'seta', ink: 'tinta', rice: 'arroz', beef: 'ternera', lightning: 'rayo', pepper: 'pimienta',
    flour: 'harina', sun_nectar: 'néctar solar', butter: 'mantequilla', honey: 'miel', roe: 'huevas',
    seaweed: 'alga', pearl: 'perla', phoenix: 'pluma de fénix', dragon_glass: 'vidrio de dragón',
    star_dust: 'polvo de estrellas', elixir: 'elixir',
  };
  const label = (i: string) => INGREDIENT_NAME[i] ?? i.replace(/_/g, ' ');

  /** Segundos que se muestra la receta antes de tener que repetirla de memoria. */
  const MEMORIZE_SECONDS = 4;

  let menu: CookingDailyMenu | null = null;
  let session: CookingStart | null = null;
  let phase: 'idle' | 'memorize' | 'cook' | 'done' = 'idle';
  let picked: string[] = [];
  let secondsLeft = 0;
  let result: CookingSubmit | null = null;
  let error = '';
  let busy = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  onMount(async () => {
    try {
      menu = await api.cookingDailyMenu();
    } catch {
      menu = null;
    }
  });
  onDestroy(stopTimer);

  async function start() {
    if (!pet) return;
    busy = true;
    error = '';
    result = null;
    picked = [];
    try {
      session = await api.cookingStart(pet.id);
      dispatch('refreshPet');
      phase = 'memorize';
      secondsLeft = session.durationSeconds;
      const memorizeUntil = Date.now() + MEMORIZE_SECONDS * 1000;
      // Reloj local (no `expiresAt`) para no depender del desfase con el servidor
      const deadline = Date.now() + session.durationSeconds * 1000;
      timer = setInterval(() => {
        secondsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        if (phase === 'memorize' && Date.now() >= memorizeUntil) phase = 'cook';
        if (secondsLeft === 0 && phase !== 'done') void submit();
      }, 250);
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = false;
    }
  }

  /** Índices de `session.order` ya usados (puede haber ingredientes repetidos). */
  let usedIdx: number[] = [];

  function pick(i: number) {
    if (phase !== 'cook' || !session || usedIdx.includes(i)) return;
    usedIdx = [...usedIdx, i];
    picked = [...picked, session.order[i]];
    if (picked.length === session.ingredients.length) void submit();
  }

  function undo() {
    usedIdx = usedIdx.slice(0, -1);
    picked = picked.slice(0, -1);
  }

  async function submit() {
    if (!session || busy || phase === 'done') return;
    stopTimer();
    phase = 'done';
    busy = true;
    const correct = picked.filter((ing, i) => session!.ingredients[i] === ing).length;
    const correctOrder = correct === session.ingredients.length;
    try {
      result = await api.cookingSubmit(session.sessionId, correct * 25, correctOrder);
      dispatch('refreshUser');
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = false;
      usedIdx = [];
    }
  }
</script>

<div class="card">
  <div class="head">
    <span class="big">🍳</span>
    <div class="title">
      <div class="name">Cocina</div>
      <small>Memoriza la receta y añade los ingredientes en orden · cuesta 10 de energía</small>
    </div>
  </div>

  {#if menu && phase === 'idle'}
    <div class="menu">
      <b>Menú del día:</b> {menu.recipeName} (dificultad {menu.difficulty})
      <div class="chips">{#each menu.ingredients as ing}<span class="chip">{icon(ing)} {label(ing)}</span>{/each}</div>
      <small>+{menu.buff.value} {menu.buff.stat} · {menu.bonus}</small>
    </div>
  {/if}

  {#if session && (phase === 'memorize' || phase === 'cook')}
    <div class="recipe-head">
      <b>{session.recipeName}</b>
      <span class="timer" class:low={secondsLeft <= 10}>⏱ {secondsLeft}s</span>
    </div>

    {#if phase === 'memorize'}
      <div class="sec-title">Memoriza el orden…</div>
      <div class="chips big-chips">
        {#each session.ingredients as ing, i}<span class="chip"><b>{i + 1}.</b> {icon(ing)} {label(ing)}</span>{/each}
      </div>
    {:else}
      <div class="sec-title">Tu olla ({picked.length}/{session.ingredients.length})</div>
      <div class="chips pot">
        {#each picked as ing, i}<span class="chip"><b>{i + 1}.</b> {icon(ing)}</span>{:else}<small>Vacía</small>{/each}
      </div>
      <div class="sec-title">Ingredientes</div>
      <div class="chips">
        {#each session.order as ing, i}
          <button class="chip btn-chip" disabled={usedIdx.includes(i)} on:click={() => pick(i)}>
            {icon(ing)} {label(ing)}
          </button>
        {/each}
      </div>
      <div class="row">
        <button class="ghost" disabled={picked.length === 0} on:click={undo}>↶ Deshacer</button>
        <button class="ghost" on:click={submit}>Servir ya</button>
      </div>
    {/if}
  {:else}
    <button class="primary" disabled={!pet || busy} on:click={start}>
      {#if busy}…{:else if pet}{phase === 'done' ? 'Cocinar otra vez' : 'Empezar a cocinar'}{:else}Sin mascota activa{/if}
    </button>
  {/if}

  {#if result}
    {#if result.message}
      <p class="info-msg">{result.message}</p>
    {:else}
      <p class="ok-msg">
        {result.correctPct}% correcto · +{result.coins ?? 0} monedas
        {#if result.buff} · buff +{result.buff.value} {result.buff.stat} (24 h){/if}
      </p>
    {/if}
  {/if}
  {#if error}<div class="error-msg">{error}</div>{/if}
</div>

<style>
  .card { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: var(--radius-2xl); background: var(--surface-2); border: 1px solid var(--line-soft); }
  .head { display: flex; gap: 12px; align-items: center; }
  .big { font-size: 34px; }
  .title { display: flex; flex-direction: column; gap: 2px; }
  .name { font-size: 16px; font-weight: 700; }
  .title small { color: var(--ink-muted); font-size: 11px; }
  .menu { display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
  .menu small { color: var(--ink-muted); font-size: 11px; }
  .recipe-head { display: flex; justify-content: space-between; align-items: center; font-size: 14px; }
  .timer { font-variant-numeric: tabular-nums; font-weight: 700; }
  .timer.low { color: var(--danger-ink); }
  .sec-title { font-weight: 700; font-size: 13px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chips small { color: var(--ink-muted); font-size: 11px; }
  .chip { padding: 4px 8px; border-radius: var(--radius-2xl); background: var(--surface); border: 1px solid var(--line-soft); font-size: 12px; color: var(--ink); }
  .big-chips .chip { font-size: 14px; padding: 6px 10px; }
  .pot { min-height: 30px; padding: 6px; border-radius: var(--radius-2xl); border: 1px dashed var(--line-soft); }
  .btn-chip { cursor: pointer; }
  .btn-chip:hover:not(:disabled) { border-color: var(--accent); }
  .btn-chip:disabled { opacity: 0.35; cursor: not-allowed; }
  .row { display: flex; gap: 6px; }
  .ghost { flex: 1; padding: 6px; border-radius: var(--radius-2xl); border: 1px solid var(--line-soft); background: var(--surface); color: var(--ink); cursor: pointer; font-size: 12px; }
  .ghost:disabled { opacity: 0.5; cursor: not-allowed; }
  .primary { padding: 10px; border: none; border-radius: var(--radius-2xl); cursor: pointer; font-weight: 700; background: var(--accent); color: var(--on-color); width: 100%; }
  .primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .info-msg { font-size: 12px; text-align: center; margin: 0; color: var(--ink); }
  .ok-msg { font-size: 12px; color: var(--success-ink); text-align: center; background: color-mix(in srgb, var(--success) 12%, var(--surface)); border: 1px solid var(--success); border-radius: var(--radius-2xl); padding: 8px; margin: 0; }
  .error-msg { background: color-mix(in srgb, var(--danger) 20%, var(--surface)); border: 1px solid var(--danger); color: var(--danger-ink); padding: 8px; border-radius: var(--radius-2xl); font-size: 12px; }
</style>
