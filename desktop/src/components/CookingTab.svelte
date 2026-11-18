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
  /** Segundos que quedan para memorizar la receta antes de que se oculte. */
  let memorizeLeft = 0;
  let menuError = false;

  // El servidor manda las estadísticas en inglés.
  const STAT_LABEL: Record<string, string> = { energy: 'energía', happiness: 'felicidad', hunger: 'saciedad', hygiene: 'higiene', atk: 'ataque', def: 'defensa', vel: 'velocidad', hp: 'vida', esp: 'especial' };
  const stat = (s: string) => STAT_LABEL[s] ?? s;

  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  async function loadMenu() {
    menuError = false;
    try {
      menu = await api.cookingDailyMenu();
    } catch {
      menu = null;
      menuError = true;
    }
  }
  onMount(loadMenu);
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
      memorizeLeft = MEMORIZE_SECONDS;
      timer = setInterval(() => {
        secondsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        memorizeLeft = Math.max(0, Math.ceil((memorizeUntil - Date.now()) / 1000));
        if (phase === 'memorize' && Date.now() >= memorizeUntil) phase = 'cook';
        if (secondsLeft === 0 && phase !== 'done') void submit();
      }, 250);
    } catch (e: any) {
      error = e instanceof TypeError ? 'Sin conexión con el servidor. Inténtalo de nuevo en un momento.' : e?.message || 'No se pudo empezar a cocinar.';
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
          <Badge tone={secondsLeft <= 10 ? 'danger' : 'tint'} icon="timer" title="Tiempo total">{secondsLeft} s</Badge>
        {/if}
      </svelte:fragment>
    </FeatureHeader>

    {#if menu && phase === 'idle'}
      <div class="menu">
        <span class="label-caps muted">Menú del día</span>
        <strong>{menu.recipeName} <small class="muted">· dificultad {menu.difficulty} de 5</small></strong>
        <div class="chips">{#each menu.ingredients as ing}<span class="ing">{icon(ing)} {label(ing)}</span>{/each}</div>
        <p class="ui-card__hint">Si sale bien: +{menu.buff.value} de {stat(menu.buff.stat)} · {menu.bonus}</p>
      </div>
    {/if}

    {#if menuError && phase === 'idle'}
      <Notice tone="warning">No se pudo cargar el menú del día.
        <svelte:fragment slot="end"><Button variant="ghost" size="sm" on:click={loadMenu}>Reintentar</Button></svelte:fragment>
      </Notice>
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
      <SectionHeader title="Memoriza el orden" icon="brain" count="{memorizeLeft} s" />
      <p class="sr-only" role="status">Tienes {MEMORIZE_SECONDS} segundos para memorizar la receta.</p>
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
      {@const pct = result.correctPct ?? 0}
      <Notice tone={pct >= 75 ? 'ok' : pct >= 25 ? 'info' : 'warning'} icon={pct >= 75 ? 'party' : 'chef'}>
        {pct >= 75 ? '¡Te ha salido muy bien!' : pct >= 25 ? 'No está mal.' : 'Se te ha quemado un poco.'}
        {pct}% en su sitio · +{result.coins ?? 0} monedas
        {#if result.buff} · +{result.buff.value} de {stat(result.buff.stat)} durante 24 h{/if}
      </Notice>
    {/if}
  {/if}
  {#if error}<Notice tone="error">{error}</Notice>{/if}
</div>

<style>
  .menu {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    font-size: var(--text-label);
  }
  .recipe {
    font-family: var(--font-display);
    font-weight: 400;
    font-size: var(--text-body-lg);
    text-transform: uppercase;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .ing {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-pills);
    background: var(--surface);
    color: var(--ink);
    font-size: var(--text-caption);
  }
  .ing--big {
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-body);
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
    padding: var(--space-2);
    border: 1.5px dashed var(--line-soft);
    border-radius: var(--radius-2xl);
  }
  .row {
    display: flex;
    gap: var(--space-2);
  }
</style>
