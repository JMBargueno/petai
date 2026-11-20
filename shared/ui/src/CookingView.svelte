<script lang="ts">
  /**
   * Cocina del Santuario (spec 15). Se cocina con éter condensado: los ingredientes son comida de
   * `foods.json` y se pintan con su icono de pixel art.
   *
   * - Recetario: el Menú del día (una receta propia por día de la semana, buff ×1.5) y las recetas
   *   que se aprenden subiendo de nivel. Se elige qué cocinar.
   * - El Pockai dicta la receta, más deprisa cuanto más difícil; después hay que echar los
   *   ingredientes a la olla en ese orden, sin picar en los señuelos.
   * - Olla caliente: en algunas posiciones el ingrediente tiene que caer a tiempo o se quema.
   * - El servidor cuenta los aciertos (`picked`, `pickedAt`) y decide la nota; el buff se aplica de
   *   verdad en combate durante 24 h. Los sonidos son los `cook.*` de la spec 40, por el puerto de
   *   sonido de la biblioteca (`setUiSound`).
   *
   * El juego (dictado, reloj, olla) es de la vista. El contenedor de cada app carga el recetario,
   * empieza (y pasa la sesión en `session`) y sirve (y pasa la nota en `result`).
   */
  import { onDestroy, createEventDispatcher } from 'svelte';
  import { dishArt } from './dishes';
  import { uiLoop, uiSfx as sfx, uiStopLoop } from './sound';
  import Badge from './Badge.svelte';
  import Button from './Button.svelte';
  import Card from './Card.svelte';
  import FeatureHeader from './FeatureHeader.svelte';
  import Ico from './Ico.svelte';
  import ItemIcon from './ItemIcon.svelte';
  import Notice from './Notice.svelte';
  import PetMiniAvatar from './PetMiniAvatar.svelte';
  import SectionHeader from './SectionHeader.svelte';
  import foods from '../../game-data/foods.json';
  import speciesData from '../../game-data/species.json';

  export let pet: any = null;
  /** Menú del día. */
  export let menu: any = null;
  /** Recetario de la mascota (recetas normales y menús de la semana). */
  export let book: any[] = [];
  /** Buffs de cocina activos. */
  export let buffs: any[] = [];
  export let loadError = false;
  export let error = '';
  /** Empezar o servir en curso. */
  export let busy = false;
  /** Sesión que devolvió el servidor al empezar; una nueva arranca el dictado. */
  export let session: any = null;
  /** Nota que devolvió el servidor al servir. */
  export let result: any = null;

  const dispatch = createEventDispatcher<{
    start: string | undefined;
    submit: { sessionId: string; score: number; perfect: boolean; picked: string[]; pickedAt: number[] };
    back: void;
    retry: void;
  }>();

  const FOOD_NAME: Record<string, string> = Object.fromEntries((foods as { id: string; name: string }[]).map((f) => [f.id, f.name]));
  const label = (id: string) => FOOD_NAME[id] ?? id.replace(/_/g, ' ');
  /** Flujo de cada fruto: el de las especies que lo tienen de favorito. Al echarlo a la olla suena su acento. */
  const FOOD_FLOW: Record<string, string> = Object.fromEntries((speciesData as { favoriteFood: string; element: string }[]).map((s) => [s.favoriteFood, s.element]));

  /** Al acabar de dictar, la receta se queda a la vista un momento más (igual que en el servidor). */
  const HOLD_MS = 2500;
  const AMBIENT = 'cook.ambient';
  const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  let phase: 'idle' | 'memorize' | 'cook' | 'done' = 'idle';
  let picked: string[] = [];
  /** Ms desde que empezó a cocinar en que cayó cada ingrediente de `picked`. */
  let pickedAt: number[] = [];
  let cookT0 = 0;
  let now = Date.now();
  let secondsLeft = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  /** Segundos que quedan para memorizar la receta antes de que se oculte. */
  let memorizeLeft = 0;
  /** Ingredientes de la receta que el Pockai ya ha dictado. */
  let revealed = 0;
  /** Gesto del Pockai al acabar (y contador para que el avatar lo repita). */
  let petAction: string | null = null;
  let petActionKey = 0;
  /** Índices de `session.order` ya usados. */
  let usedIdx: number[] = [];
  /** Hueco de la olla caliente del que ya se avisó (calentándose / quemado), para sonar una vez. */
  let hotWarned = -1;
  let hotBurned = -1;
  /** Con menos de esto en la olla caliente suena el aviso. */
  const HOT_WARN_MS = 1500;

  // El servidor manda las estadísticas en inglés.
  const STAT_LABEL: Record<string, string> = { atk: 'ataque', def: 'defensa', vel: 'velocidad', hp: 'vida', esp: 'especial', all: 'todas las stats' };
  const stat = (s: string) => STAT_LABEL[s] ?? s;
  const buffText = (b: { stat: string; value: number }) => `+${b.value} ${b.stat === 'all' ? 'a ' : 'de '}${stat(b.stat)}`;

  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function react(action: string) {
    petAction = action;
    petActionKey += 1;
  }

  onDestroy(() => {
    stopTimer();
    uiStopLoop(AMBIENT);
  });

  const load = () => dispatch('retry');

  /** Pide empezar; la sesión llega por `session`. */
  function start(recipeId?: string) {
    if (!pet || busy) return;
    picked = [];
    pickedAt = [];
    usedIdx = [];
    revealed = 0;
    hotWarned = -1;
    hotBurned = -1;
    dispatch('start', recipeId);
  }

  // Una sesión nueva arranca el dictado.
  let lastSession: any = null;
  $: if (session && session !== lastSession) {
    lastSession = session;
    begin(session);
  }

  function begin(s: any) {
    stopTimer();
    phase = 'memorize';
    uiLoop(AMBIENT);
    const count = s.ingredients.length;
    const memorizeMs = count * s.revealMs + HOLD_MS;
    const t0 = Date.now();
    // El reloj de cocinar empieza al ocultarse la receta. Reloj local (no `expiresAt`) para no
    // depender del desfase con el servidor.
    cookT0 = t0 + memorizeMs;
    const deadline = cookT0 + s.durationSeconds * 1000;
    secondsLeft = s.durationSeconds;
    memorizeLeft = Math.ceil(memorizeMs / 1000);
    timer = setInterval(() => {
      now = Date.now();
      memorizeLeft = Math.max(0, Math.ceil((cookT0 - now) / 1000));
      if (phase === 'memorize') {
        // Cada ingrediente que dicta suena un poco más agudo que el anterior.
        const shown = Math.min(count, Math.floor((now - t0) / s.revealMs) + 1);
        if (shown > revealed) {
          revealed = shown;
          sfx('cook.memorize.show', { rate: 1 + (shown - 1) * 0.12 });
        }
        if (now >= cookT0) phase = 'cook';
        return;
      }
      const left = Math.max(0, Math.ceil((deadline - now) / 1000));
      // Los últimos 5 segundos avisan, uno por segundo.
      if (left !== secondsLeft && left > 0 && left <= 5 && phase === 'cook') sfx('cook.timer_warning');
      secondsLeft = left;
      if (hotLeft !== null && hotLeft > 0 && hotLeft <= HOT_WARN_MS && hotWarned !== picked.length) {
        hotWarned = picked.length;
        sfx('cook.hotpot.warn');
      }
      if (hotLeft !== null && hotLeft <= 0 && hotBurned !== picked.length) {
        hotBurned = picked.length;
        // Sin el sonido propio (aún no generado), el del plato fallido, agudo y bajito
        if (!sfx('cook.hotpot.burn')) sfx('cook.result.fail', { gainDb: -10, rate: 1.4 });
      }
      if (secondsLeft === 0 && phase !== 'done') submit();
    }, 100);
  }

  function pick(i: number) {
    if (phase !== 'cook' || !session || usedIdx.includes(i)) return;
    const ing = session.order[i];
    // Llegó a tiempo a un hueco de la olla caliente
    if (hotLeft !== null && hotLeft > 0) sfx('cook.hotpot.saved', { delayMs: 80 });
    usedIdx = [...usedIdx, i];
    picked = [...picked, ing];
    pickedAt = [...pickedAt, Math.max(0, Date.now() - cookT0)];
    sfx('cook.ingredient.place');
    // Un fruto de un Flujo suena a su Flujo al caer en la olla.
    const flow = FOOD_FLOW[ing];
    if (flow) sfx(`elem.${flow}.accent`, { gainDb: -9, delayMs: 120 });
    if (picked.length === session.ingredients.length) submit();
  }

  function undo() {
    if (picked.length === 0) return;
    usedIdx = usedIdx.slice(0, -1);
    picked = picked.slice(0, -1);
    pickedAt = pickedAt.slice(0, -1);
    sfx('cook.undo');
  }

  /** Sirve el plato; la nota llega por `result`. */
  function submit() {
    if (!session || busy || phase === 'done') return;
    stopTimer();
    phase = 'done';
    uiStopLoop(AMBIENT);
    sfx('cook.serve');
    const correct = picked.filter((ing, i) => session.ingredients[i] === ing).length;
    dispatch('submit', { sessionId: session.sessionId, score: correct * 25, perfect: correct === session.ingredients.length, picked, pickedAt });
  }

  // La nota del servidor: su sonido y el gesto del Pockai.
  let lastResult: any = null;
  $: if (result && result !== lastResult) {
    lastResult = result;
    usedIdx = [];
    const grade = result.message ? 'bad' : result.grade ?? 'bad';
    sfx(grade === 'perfect' ? 'cook.result.perfect' : grade === 'good' ? 'cook.result.good' : 'cook.result.fail', { delayMs: 500 });
    react(grade === 'perfect' ? 'celebrate' : grade === 'good' ? 'happy' : 'cry');
  }

  function backToBook() {
    phase = 'idle';
    dispatch('back');
  }

  // Sin sesión (el contenedor la ha soltado, o empezar falló) se vuelve al recetario.
  $: if (!session && phase !== 'idle') {
    stopTimer();
    uiStopLoop(AMBIENT);
    phase = 'idle';
  }

  $: playing = !!session && (phase === 'memorize' || phase === 'cook');
  $: petName = pet?.nickname || pet?.species?.name || 'tu Pockai';
  $: regular = book.filter((r) => !r.dailyMenu);
  $: weekMenus = book.filter((r) => r.dailyMenu).sort((a, b) => ((a.weekday ?? 0) + 6) % 7 - ((b.weekday ?? 0) + 6) % 7);
  /** Olla caliente: ¿el siguiente hueco quema? Ms que quedan desde el último ingrediente. */
  $: hotNext = !!session && phase === 'cook' && picked.length > 0 && session.hotPotPositions.includes(picked.length);
  $: hotLeft = hotNext && session ? session.hotPotWindowMs - (now - cookT0 - pickedAt[pickedAt.length - 1]) : null;
  $: activeBuffs = buffs.filter((b) => new Date(b.expiresAt).getTime() > Date.now());
  const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);
</script>


<div class="ui-stack">
  <Card variant="hero" backdrop="kitchen">
    <FeatureHeader icon="chef" title="Cocina del Santuario" sub="Tu Pockai dicta la receta y tú echas el éter condensado a la olla, en su orden · cuesta 10 de energía">
      <svelte:fragment slot="end">
        {#if playing && phase === 'cook'}
          <Badge tone={secondsLeft <= 10 ? 'danger' : 'tint'} icon="timer" title="Tiempo para cocinar">{secondsLeft} s</Badge>
        {/if}
      </svelte:fragment>
    </FeatureHeader>

    {#if menu && phase === 'idle'}
      <div class="menu">
        <div class="menu__head">
          {#if dishArt(menu.recipeId)}<img class="dish-art dish-art--lg" src={dishArt(menu.recipeId)} alt="" width="96" height="96" draggable="false" />{/if}
          <div class="menu__title">
            <span class="label-caps muted">Menú del día · {DAYS[menu.weekday]}</span>
            <strong class="recipe">{menu.recipeName}</strong>
            {#if menu.description}<p class="lore">{menu.description}</p>{/if}
          </div>
        </div>
        <div class="chips">
          {#each menu.ingredients as ing}<span class="ing"><ItemIcon id={ing} /> {label(ing)}</span>{/each}
        </div>
        <p class="ui-card__hint"><span class="stars" title="Dificultad {menu.difficulty} de 5">{stars(menu.difficulty)}</span> · Si sale perfecto: {buffText(menu.buff)} durante 24 h ({menu.bonus})</p>
        <Button variant="primary" size="lg" block icon="chef" loading={busy} disabled={!pet} on:click={() => start()}>
          {pet ? 'Cocinar el menú del día' : 'Sin mascota activa'}
        </Button>
      </div>
    {/if}

    {#if loadError && phase === 'idle'}
      <Notice tone="warning">No se pudo cargar el recetario.
        <svelte:fragment slot="end"><Button variant="ghost" size="sm" on:click={load}>Reintentar</Button></svelte:fragment>
      </Notice>
    {/if}
  </Card>

  {#if phase === 'idle'}
    {#if activeBuffs.length > 0}
      <div class="buffs" role="status">
        <Ico n="flame" size={16} />
        <span>En combate ahora:</span>
        {#each activeBuffs as b}<Badge tone="tint">+{b.value} {stat(b.stat)}</Badge>{/each}
      </div>
    {/if}

    {#if regular.length > 0}
      <SectionHeader title="Recetario" icon="book" count="{regular.filter((r) => r.available).length}/{regular.length}" />
      <div class="book">
        {#each regular as r (r.id)}
          <button class="dish" class:is-locked={!r.available} disabled={!r.available || busy || !pet} on:click={() => start(r.id)}
            title={r.available ? `Cocinar ${r.name}` : `Se aprende a nivel ${r.unlockLevel}`}>
            <span class="dish__top">
              {#if dishArt(r.id)}<img class="dish-art" src={dishArt(r.id)} alt="" width="64" height="64" draggable="false" />{/if}
              <strong class="dish__name">{r.name}</strong>
              {#if r.perfect}<Ico n="crown" size={14} />{:else if !r.available}<Ico n="lock" size={14} />{/if}
            </span>
            <span class="stars" aria-label="Dificultad {r.difficulty} de 5">{stars(r.difficulty)}</span>
            {#if r.ingredients}
              <span class="dish__ings">{#each r.ingredients as ing}<ItemIcon id={ing} />{/each}</span>
            {:else}
              <span class="dish__ings muted">Nivel {r.unlockLevel}</span>
            {/if}
            <span class="dish__buff">{buffText(r.buff)}</span>
            {#if r.best !== null && !r.perfect}<span class="muted dish__best">Mejor: {r.best}/{r.ingredients?.length ?? '?'}</span>{/if}
          </button>
        {/each}
      </div>
    {/if}

    {#if weekMenus.length > 0}
      <SectionHeader title="Menús de la semana" icon="clock" />
      <div class="week">
        {#each weekMenus as r (r.id)}
          <span class="day" class:is-today={r.today} title={r.description ?? r.name}>
            <b>{DAYS[r.weekday ?? 0].slice(0, 3)}</b>
            {#if dishArt(r.id)}<img class="dish-art" class:is-dim={!r.today} src={dishArt(r.id)} alt="" width="32" height="32" draggable="false" />{/if}
            <span>{r.name}</span>
            {#if r.perfect}<Ico n="crown" size={12} />{/if}
          </span>
        {/each}
      </div>
    {/if}
  {/if}

  {#if session && phase !== 'idle'}
    <div class="stove">
      {#if pet}
        <span class="stove__pet"><PetMiniAvatar {pet} size={72} interactive={false} action={petAction} actionKey={petActionKey} /></span>
      {/if}
      <div class="stove__body">
        <strong class="recipe">{session.recipeName}{#if session.isDailyMenu} <Badge tone="tint">Menú del día</Badge>{/if}</strong>
        {#if phase === 'memorize'}
          <p class="ui-card__hint" role="status">{petName} dicta la receta. Quédate con el orden: {memorizeLeft} s.</p>
        {:else if phase === 'cook'}
          <p class="ui-card__hint">Echa a la olla los {session.ingredients.length} ingredientes, en su orden. No todo lo que hay en la encimera es de la receta.{#if session.hotPotPositions.length}{' '}Los huecos con llama se queman si tardas.{/if}</p>
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
          <li class="step" class:is-hidden={i >= revealed} class:is-hot={session.hotPotPositions.includes(i)}>
            <b>{i + 1}</b>
            {#if session.hotPotPositions.includes(i)}<span class="step__flame" title="Olla caliente"><Ico n="flame" size={14} /></span>{/if}
            {#if i < revealed}<ItemIcon id={ing} scale={2} /><span>{label(ing)}</span>{:else}<span class="step__gap" aria-hidden="true"></span>{/if}
          </li>
        {/each}
      </ol>
    {:else}
      <SectionHeader title="La olla" icon="chef" count="{picked.length}/{session.ingredients.length}" />
      <ol class="steps pot">
        {#each session.ingredients as _, i}
          {@const hot = session.hotPotPositions.includes(i)}
          {@const isNext = i === picked.length}
          <li class="step" class:is-hidden={i >= picked.length} class:is-hot={hot} class:is-next={isNext}
            class:is-burning={isNext && hotLeft !== null && hotLeft <= 0}>
            <b>{i + 1}</b>
            {#if hot}<span class="step__flame" title="Olla caliente"><Ico n="flame" size={14} /></span>{/if}
            {#if picked[i]}
              <ItemIcon id={picked[i]} scale={2} /><span>{label(picked[i])}</span>
            {:else if isNext && hotLeft !== null}
              <span class="step__gap hot-timer" role="timer">{hotLeft > 0 ? `${(hotLeft / 1000).toFixed(1)} s` : '¡Se quema!'}</span>
            {:else}
              <span class="step__gap" aria-hidden="true"></span>
            {/if}
          </li>
        {/each}
      </ol>
      <SectionHeader title="La encimera" icon="food" />
      <div class="counter">
        {#each session.order as ing, i}
          <!-- El clic suena al caer en la olla (cook.ingredient.place); al apretar, el tap. -->
          <button class="ing ing--btn" data-sound="none" disabled={usedIdx.includes(i)}
            on:pointerdown={() => !usedIdx.includes(i) && sfx('cook.ingredient.tap', { gainDb: -8 })} on:click={() => pick(i)}>
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
      {@const grade = result.grade ?? 'bad'}
      {#if session && dishArt(session.recipeId)}
        <div class="served" class:is-bad={grade === 'bad'}>
          <img class="dish-art dish-art--lg" src={dishArt(session.recipeId)} alt={session.recipeName} width="96" height="96" draggable="false" />
        </div>
      {/if}
      <Notice tone={grade === 'perfect' ? 'ok' : grade === 'good' ? 'info' : 'warning'} icon={grade === 'perfect' ? 'party' : 'chef'}>
        {grade === 'perfect' ? '¡Plato perfecto!' : grade === 'good' ? 'Te ha salido bien.' : 'Este no ha salido.'}
        {result.correctPct ?? 0}% de la receta · +{result.coins ?? 0} monedas{#if result.speedBonus} (+{result.speedBonus} por rapidez){/if}
        {#if result.buff} · {buffText(result.buff)} en combate durante 24 h{/if}
      </Notice>
    {/if}
    {#if session && phase === 'done'}
      <SectionHeader title="La receta era" icon="brain" />
      <div class="chips">
        {#each session.ingredients as ing, i}
          {@const slot = result.slots?.[i] ?? (picked[i] === ing ? 'ok' : 'miss')}
          <span class="ing" class:is-wrong={slot === 'miss'} class:is-burned={slot === 'burned'} title={slot === 'burned' ? 'Se quemó' : slot === 'miss' ? 'Faltó' : 'Bien'}>
            <b>{i + 1}.</b> <ItemIcon id={ing} /> {label(ing)}{#if slot === 'burned'} <Ico n="flame" size={12} />{/if}
          </span>
        {/each}
      </div>
      <div class="row">
        <span><Button block icon="book" on:click={backToBook}>Volver al recetario</Button></span>
        <span><Button block variant="primary" icon="chef" loading={busy} on:click={() => start(session?.recipeId)}>Cocinar otra vez</Button></span>
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
  .menu__head {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .menu__title {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }
  .dish-art {
    flex-shrink: 0;
    image-rendering: pixelated;
  }
  .dish-art--lg {
    width: 96px;
    height: 96px;
  }
  .dish-art.is-dim {
    opacity: 0.55;
    filter: grayscale(0.6);
  }
  .served {
    display: grid;
    place-items: center;
    animation: serve 0.45s var(--ease-out) both;
  }
  .served.is-bad .dish-art {
    filter: grayscale(0.8) brightness(0.7);
  }
  @keyframes serve {
    from { transform: translateY(8px) scale(0.85); opacity: 0; }
    to { transform: none; opacity: 1; }
  }
  .lore {
    margin: 0;
    color: var(--ink-muted);
    font-style: italic;
  }
  .stars {
    color: var(--warn-ink, var(--ink));
    letter-spacing: 1px;
  }
  .buffs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-caption);
  }
  .book {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: var(--space-2);
  }
  .dish {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
    padding: var(--space-3);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-2xl);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: var(--text-caption);
    text-align: left;
    cursor: pointer;
    transition: border-color var(--dur-1), transform var(--dur-1) var(--ease-out);
  }
  .dish:hover:not(:disabled) {
    border-color: var(--line);
    transform: translateY(calc(var(--hover-lift, -2px) / 2));
  }
  .dish:disabled {
    cursor: not-allowed;
  }
  .dish.is-locked {
    opacity: 0.55;
    border-style: dashed;
  }
  .dish__top {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
  }
  .dish__name {
    flex: 1;
    min-width: 0;
  }
  .dish__ings {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    min-height: 32px;
    align-items: center;
  }
  .dish__buff {
    font-weight: 600;
  }
  .dish__best {
    font-size: var(--text-micro, var(--text-caption));
  }
  .week {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: var(--space-2);
  }
  .day {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-2);
    border: 1px dashed var(--line-soft);
    border-radius: var(--radius-xl, var(--radius-2xl));
    font-size: var(--text-caption);
    color: var(--ink-muted);
  }
  .day b {
    text-transform: uppercase;
    font-size: var(--text-micro, var(--text-caption));
  }
  .day.is-today {
    border-style: solid;
    border-color: var(--line);
    background: var(--surface);
    color: var(--ink);
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
  .ing.is-burned {
    border-color: var(--danger-ink);
    color: var(--danger-ink);
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
  .step.is-hot {
    border-color: var(--danger-ink);
  }
  .step.is-next {
    border-style: solid;
    border-width: 2px;
  }
  .step.is-burning {
    animation: burn 0.4s ease-in-out infinite alternate;
  }
  .step__flame {
    position: absolute;
    top: var(--space-2);
    right: var(--space-2);
    color: var(--danger-ink);
  }
  .step__gap {
    width: 64px;
    height: 64px;
  }
  .hot-timer {
    display: grid;
    place-items: center;
    color: var(--danger-ink);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
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
    transform: translateY(calc(var(--hover-lift, -2px) / 2));
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
  @keyframes burn {
    from { background: var(--surface); }
    to { background: color-mix(in srgb, var(--danger-ink) 18%, var(--surface)); }
  }
  @media (prefers-reduced-motion: reduce) {
    .ing--btn,
    .dish {
      transition: none;
    }
    .served {
      animation: none;
    }
    .step.is-burning {
      animation: none;
      background: color-mix(in srgb, var(--danger-ink) 18%, var(--surface));
    }
  }
</style>
