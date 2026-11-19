<script lang="ts">
  /**
   * Cocina del Santuario (spec 15). Se cocina con éter condensado: los ingredientes son comida de
   * `foods.json` y se pintan con su icono de pixel art. El Pockai dicta la receta, ingrediente a
   * ingrediente; después hay que echarlos a la olla en ese orden, sin picar en los que sobran.
   * El servidor cuenta los aciertos con lo que se echó (`picked`). Los sonidos son los `cook.*` de
   * la spec 40.
   */
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { Badge, Button, Card, FeatureHeader, Notice, SectionHeader } from './ui';
  import { api, type CookingDailyMenu, type CookingStart, type CookingSubmit } from '../lib/api';
  import { sfx, sfxLoop, sfxStopLoop } from '../lib/audio';
  import ItemIcon from './ItemIcon.svelte';
  import PetMiniAvatar from './PetMiniAvatar.svelte';
  import foods from '@shared/game-data/foods.json';
  import speciesData from '@shared/game-data/species.json';

  const dispatch = createEventDispatcher();

  export let pet: any = null;

  const FOOD_NAME: Record<string, string> = Object.fromEntries((foods as { id: string; name: string }[]).map((f) => [f.id, f.name]));
  const label = (id: string) => FOOD_NAME[id] ?? id.replace(/_/g, ' ');
  /** Flujo de cada fruto: el de las especies que lo tienen de favorito. Al echarlo a la olla suena su acento. */
  const FOOD_FLOW: Record<string, string> = Object.fromEntries((speciesData as { favoriteFood: string; element: string }[]).map((s) => [s.favoriteFood, s.element]));

  /** El Pockai dicta un ingrediente cada tanto; al acabar deja la receta a la vista un momento más. */
  const REVEAL_MS = 700;
  const HOLD_MS = 2500;
  const AMBIENT = 'cook.ambient';

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
  /** Ingredientes de la receta que el Pockai ya ha dictado. */
  let revealed = 0;
  let menuError = false;
  /** Gesto del Pockai al acabar (y contador para que el avatar lo repita). */
  let petAction: string | null = null;
  let petActionKey = 0;

  // El servidor manda las estadísticas en inglés.
  const STAT_LABEL: Record<string, string> = { energy: 'energía', happiness: 'felicidad', hunger: 'saciedad', hygiene: 'higiene', atk: 'ataque', def: 'defensa', vel: 'velocidad', hp: 'vida', esp: 'especial' };
  const stat = (s: string) => STAT_LABEL[s] ?? s;

  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function react(action: string) {
    petAction = action;
    petActionKey += 1;
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
  onDestroy(() => {
    stopTimer();
    sfxStopLoop(AMBIENT);
  });

  async function start() {
    if (!pet) return;
    busy = true;
    error = '';
    result = null;
    picked = [];
    usedIdx = [];
    revealed = 0;
    try {
      session = await api.cookingStart(pet.id);
      dispatch('refreshPet');
      phase = 'memorize';
      sfxLoop(AMBIENT);
      secondsLeft = session.durationSeconds;
      const count = session.ingredients.length;
      const memorizeMs = count * REVEAL_MS + HOLD_MS;
      const t0 = Date.now();
      // Reloj local (no `expiresAt`) para no depender del desfase con el servidor
      const deadline = t0 + session.durationSeconds * 1000;
      memorizeLeft = Math.ceil(memorizeMs / 1000);
      timer = setInterval(() => {
        const now = Date.now();
        const left = Math.max(0, Math.ceil((deadline - now) / 1000));
        // Los últimos 5 segundos avisan, uno por segundo.
        if (left !== secondsLeft && left > 0 && left <= 5 && phase === 'cook') sfx('cook.timer_warning');
        secondsLeft = left;
        memorizeLeft = Math.max(0, Math.ceil((t0 + memorizeMs - now) / 1000));
        if (phase === 'memorize') {
          // Cada ingrediente que dicta suena un poco más agudo que el anterior.
          const shown = Math.min(count, Math.floor((now - t0) / REVEAL_MS) + 1);
          if (shown > revealed) {
            revealed = shown;
            sfx('cook.memorize.show', { rate: 1 + (shown - 1) * 0.12 });
          }
          if (now >= t0 + memorizeMs) phase = 'cook';
        }
        if (secondsLeft === 0 && phase !== 'done') void submit();
      }, 100);
    } catch (e: any) {
      error = e instanceof TypeError ? 'Sin conexión con el servidor. Inténtalo de nuevo en un momento.' : e?.message || 'No se pudo empezar a cocinar.';
    } finally {
      busy = false;
    }
  }

  /** Índices de `session.order` ya usados. */
  let usedIdx: number[] = [];

  function pick(i: number) {
    if (phase !== 'cook' || !session || usedIdx.includes(i)) return;
    const ing = session.order[i];
    usedIdx = [...usedIdx, i];
    picked = [...picked, ing];
    sfx('cook.ingredient.place');
    // Un fruto de un Flujo suena a su Flujo al caer en la olla.
    const flow = FOOD_FLOW[ing];
    if (flow) sfx(`elem.${flow}.accent`, { gainDb: -9, delayMs: 120 });
    if (picked.length === session.ingredients.length) void submit();
  }

  function undo() {
    if (picked.length === 0) return;
    usedIdx = usedIdx.slice(0, -1);
    picked = picked.slice(0, -1);
    sfx('cook.undo');
  }

  async function submit() {
    if (!session || busy || phase === 'done') return;
    stopTimer();
    phase = 'done';
    busy = true;
    sfxStopLoop(AMBIENT);
    sfx('cook.serve');
    const correct = picked.filter((ing, i) => session!.ingredients[i] === ing).length;
    const correctOrder = correct === session.ingredients.length;
    try {
      result = await api.cookingSubmit(session.sessionId, correct * 25, correctOrder, picked);
      dispatch('refreshUser');
      const pct = result.correctPct ?? 0;
      if (result.message) {
        sfx('cook.result.fail', { delayMs: 500 });
        react('cry');
      } else {
        sfx(pct >= 100 ? 'cook.result.perfect' : pct >= 50 ? 'cook.result.good' : 'cook.result.fail', { delayMs: 500 });
        react(pct >= 100 ? 'celebrate' : pct >= 50 ? 'happy' : 'cry');
      }
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = false;
      usedIdx = [];
    }
  }

  $: playing = !!session && (phase === 'memorize' || phase === 'cook');
  $: petName = pet?.nickname || pet?.species?.name || 'tu Pockai';
</script>

<div class="ui-stack">
  <Card variant="hero" backdrop="kitchen">
    <FeatureHeader icon="chef" title="Cocina del Santuario" sub="Tu Pockai dicta la receta y tú echas el éter condensado a la olla, en su orden · cuesta 10 de energía">
      <svelte:fragment slot="end">
        {#if playing}
          <Badge tone={secondsLeft <= 10 ? 'danger' : 'tint'} icon="timer" title="Tiempo total">{secondsLeft} s</Badge>
        {/if}
      </svelte:fragment>
    </FeatureHeader>

    {#if menu && phase === 'idle'}
      <div class="menu">
        <span class="label-caps muted">Menú del día</span>
        <strong>{menu.recipeName} <small class="muted">· dificultad {menu.difficulty} de 5</small></strong>
        <div class="chips">
          {#each menu.ingredients as ing}<span class="ing"><ItemIcon id={ing} /> {label(ing)}</span>{/each}
        </div>
        <p class="ui-card__hint">Si sale bien: +{menu.buff.value} de {stat(menu.buff.stat)} · {menu.bonus}</p>
      </div>
    {/if}

    {#if menuError && phase === 'idle'}
      <Notice tone="warning">No se pudo cargar el menú del día.
        <svelte:fragment slot="end"><Button variant="ghost" size="sm" on:click={loadMenu}>Reintentar</Button></svelte:fragment>
      </Notice>
    {/if}

    {#if !playing}
      <Button variant="primary" size="lg" block icon="chef" loading={busy} disabled={!pet} on:click={start}>
        {#if pet}{phase === 'done' ? 'Cocinar otra vez' : 'Empezar a cocinar'}{:else}Sin mascota activa{/if}
      </Button>
    {/if}
  </Card>

  {#if session && phase !== 'idle'}
    <div class="stove">
      {#if pet}
        <span class="stove__pet"><PetMiniAvatar {pet} size={72} interactive={false} action={petAction} actionKey={petActionKey} /></span>
      {/if}
      <div class="stove__body">
        <strong class="recipe">{session.recipeName}</strong>
        {#if phase === 'memorize'}
          <p class="ui-card__hint" role="status">{petName} dicta la receta. Quédate con el orden: {memorizeLeft} s.</p>
        {:else if phase === 'cook'}
          <p class="ui-card__hint">Echa a la olla los {session.ingredients.length} ingredientes, en su orden. No todo lo que hay en la encimera es de la receta.</p>
        {:else}
          <p class="ui-card__hint">Plato servido.</p>
        {/if}
      </div>
    </div>
  {/if}

  {#if session && playing}
    {#if phase === 'memorize'}
      <SectionHeader title="La receta" icon="brain" count="{revealed}/{session.ingredients.length}" />
      <ol class="steps">
        {#each session.ingredients as ing, i}
          <li class="step" class:is-hidden={i >= revealed}>
            <b>{i + 1}</b>
            {#if i < revealed}<ItemIcon id={ing} scale={2} /><span>{label(ing)}</span>{:else}<span class="step__gap" aria-hidden="true"></span>{/if}
          </li>
        {/each}
      </ol>
    {:else}
      <SectionHeader title="La olla" icon="chef" count="{picked.length}/{session.ingredients.length}" />
      <ol class="steps pot">
        {#each session.ingredients as _, i}
          <li class="step" class:is-hidden={i >= picked.length}>
            <b>{i + 1}</b>
            {#if picked[i]}<ItemIcon id={picked[i]} scale={2} /><span>{label(picked[i])}</span>{:else}<span class="step__gap" aria-hidden="true"></span>{/if}
          </li>
        {/each}
      </ol>
      <SectionHeader title="La encimera" icon="food" />
      <div class="counter">
        {#each session.order as ing, i}
          <!-- El clic suena al caer en la olla (cook.ingredient.place), no como un botón. -->
          <button class="ing ing--btn" data-sound="none" disabled={usedIdx.includes(i)} on:click={() => pick(i)}>
            <ItemIcon id={ing} scale={2} />
            <span>{label(ing)}</span>
          </button>
        {/each}
      </div>
      <div class="row">
        <span data-sound="none"><Button block icon="refresh" disabled={picked.length === 0} on:click={undo}>Sacar el último</Button></span>
        <span data-sound="none"><Button block variant="ink" icon="check" on:click={submit}>Servir ya</Button></span>
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
    {#if session && phase === 'done'}
      <SectionHeader title="La receta era" icon="brain" />
      <div class="chips">
        {#each session.ingredients as ing, i}
          <span class="ing" class:is-wrong={picked[i] !== ing}><b>{i + 1}.</b> <ItemIcon id={ing} /> {label(ing)}</span>
        {/each}
      </div>
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
  .stove {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .stove__pet {
    flex-shrink: 0;
  }
  .stove__body {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
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
  .ing.is-wrong {
    border-color: var(--danger-ink);
    border-style: dashed;
  }
  .steps {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .step {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    min-height: 104px;
    padding: var(--space-2);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-2xl);
    background: var(--surface);
    font-size: var(--text-caption);
    text-align: center;
  }
  .step b {
    align-self: flex-start;
    color: var(--ink-muted);
  }
  .step.is-hidden {
    border-style: dashed;
    background: transparent;
  }
  .step__gap {
    width: 64px;
    height: 64px;
  }
  .pot {
    padding: var(--space-2);
    border: 1.5px dashed var(--line-soft);
    border-radius: var(--radius-2xl);
  }
  .counter {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
    gap: var(--space-2);
  }
  .ing--btn {
    flex-direction: column;
    padding: var(--space-2);
    border-radius: var(--radius-2xl);
    cursor: pointer;
    font: inherit;
    font-size: var(--text-caption);
    font-weight: 600;
    text-align: center;
    transition: border-color var(--dur-1), transform var(--dur-1) var(--ease-out);
  }
  .ing--btn:hover:not(:disabled) {
    border-color: var(--line);
    transform: translateY(-1px);
  }
  .ing--btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .row {
    display: flex;
    gap: var(--space-2);
  }
  .row > span {
    flex: 1;
  }
  @media (prefers-reduced-motion: reduce) {
    .ing--btn {
      transition: none;
    }
  }
</style>
