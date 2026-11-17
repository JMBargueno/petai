<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { Badge, Button, Card, FeatureHeader, Notice, SectionHeader } from './ui';
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

<div class="ui-stack">
  <Card variant="hero">
    <FeatureHeader icon="chef" title="Cocina" sub="Memoriza la receta y añade los ingredientes en orden · cuesta 10 de energía">
      <svelte:fragment slot="end">
        {#if session && (phase === 'memorize' || phase === 'cook')}
          <Badge tone={secondsLeft <= 10 ? 'danger' : 'tint'} icon="timer">{secondsLeft}s</Badge>
        {/if}
      </svelte:fragment>
    </FeatureHeader>

    {#if menu && phase === 'idle'}
      <div class="menu">
        <span class="label-caps muted">Menú del día</span>
        <strong>{menu.recipeName} <small class="muted">· dificultad {menu.difficulty}</small></strong>
        <div class="chips">{#each menu.ingredients as ing}<span class="ing">{icon(ing)} {label(ing)}</span>{/each}</div>
        <p class="ui-card__hint">+{menu.buff.value} {menu.buff.stat} · {menu.bonus}</p>
      </div>
    {/if}

    {#if !(session && (phase === 'memorize' || phase === 'cook'))}
      <Button variant="primary" size="lg" block icon="chef" loading={busy} disabled={!pet} on:click={start}>
        {#if pet}{phase === 'done' ? 'Cocinar otra vez' : 'Empezar a cocinar'}{:else}Sin mascota activa{/if}
      </Button>
    {/if}
  </Card>

  {#if session && (phase === 'memorize' || phase === 'cook')}
    <strong class="recipe">{session.recipeName}</strong>
    {#if phase === 'memorize'}
      <SectionHeader title="Memoriza el orden…" icon="brain" />
      <div class="chips">
        {#each session.ingredients as ing, i}<span class="ing ing--big"><b>{i + 1}.</b> {icon(ing)} {label(ing)}</span>{/each}
      </div>
    {:else}
      <SectionHeader title="Tu olla" icon="chef" count="{picked.length}/{session.ingredients.length}" />
      <div class="chips pot">
        {#each picked as ing, i}<span class="ing"><b>{i + 1}.</b> {icon(ing)}</span>{:else}<small class="muted">Vacía</small>{/each}
      </div>
      <SectionHeader title="Ingredientes" icon="food" />
      <div class="chips">
        {#each session.order as ing, i}
          <button class="ing ing--btn" disabled={usedIdx.includes(i)} on:click={() => pick(i)}>{icon(ing)} {label(ing)}</button>
        {/each}
      </div>
      <div class="row">
        <Button block icon="refresh" disabled={picked.length === 0} on:click={undo}>Deshacer</Button>
        <Button block variant="ink" icon="check" on:click={submit}>Servir ya</Button>
      </div>
    {/if}
  {/if}

  {#if result}
    {#if result.message}
      <Notice tone="info">{result.message}</Notice>
    {:else}
      <Notice tone="ok" icon="party">
        {result.correctPct}% correcto · +{result.coins ?? 0} monedas
        {#if result.buff} · buff +{result.buff.value} {result.buff.stat} (24 h){/if}
      </Notice>
    {/if}
  {/if}
  {#if error}<Notice tone="error">{error}</Notice>{/if}
</div>

<style>
  .menu {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
  }
  .recipe {
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 16px;
    text-transform: uppercase;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .ing {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-pills);
    background: var(--surface);
    color: var(--ink);
    font-size: 12px;
  }
  .ing--big {
    padding: 6px 12px;
    font-size: 14px;
  }
  .ing--btn {
    cursor: pointer;
    font-weight: 600;
    transition: border-color var(--dur-1), transform var(--dur-1) var(--ease-out);
  }
  .ing--btn:hover:not(:disabled) {
    border-color: var(--line);
    transform: translateY(-1px);
  }
  .ing--btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .pot {
    min-height: 34px;
    padding: 8px;
    border: 1.5px dashed var(--line-soft);
    border-radius: var(--radius-2xl);
  }
  .row {
    display: flex;
    gap: var(--space-2);
  }
</style>
