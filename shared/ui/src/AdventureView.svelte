<script lang="ts">
  /**
   * Aventura diaria: el bucket de historias de hoy (las mismas para todos los Custodios) y la
   * partida en curso como narrativa gráfica. En cada escena el Pockai entra andando, al llegar al
   * centro ocurre el evento y se elige una respuesta; después se ve la consecuencia y qué eligió
   * la comunidad, y el Pockai sigue hacia la localización siguiente.
   *
   * La narración (escena, fase, reacción, final) es de la vista y la marcan los hitos de la escena.
   * El contenedor de cada app carga el día, empieza la historia (llega por `started`) y manda cada
   * respuesta (llega por `answered`).
   */
  import { tick, createEventDispatcher } from 'svelte';
  import type { StoryBeat, StoryState } from '@pockai/scene';
  import AsyncState from './AsyncState.svelte';
  import Badge from './Badge.svelte';
  import Button from './Button.svelte';
  import Card from './Card.svelte';
  import EmptyState from './EmptyState.svelte';
  import FeatureHeader from './FeatureHeader.svelte';
  import ListRow from './ListRow.svelte';
  import Notice from './Notice.svelte';
  import SectionHeader from './SectionHeader.svelte';
  import StorySceneView from './StorySceneView.svelte';

  export let pet: any = null;
  /** `GET /stories/today`. */
  export let today: any = null;
  /** `GET /stories/history`. */
  export let history: any[] = [];
  export let loading = false;
  export let loadError = '';
  export let error = '';
  /** Empezar o responder en curso. */
  export let busy = false;
  /** Partida que devolvió el servidor al empezar (con su primera escena); una nueva la abre. */
  export let started: any = null;
  /** Respuesta del servidor a la última elección; una nueva enseña su consecuencia. */
  export let answered: any = null;
  /** Clima local para la escena, si la app lo tiene. */
  export let weather: any = null;

  const dispatch = createEventDispatcher<{
    open: any;
    choose: { storyId: string; sceneIndex: number; optionIndex: number };
    finished: void;
    retry: void;
  }>();

  const OUTCOME: Record<string, { label: string; icon: string; tone: 'success' | 'warning' | 'neutral' }> = {
    win: { label: 'Victoria', icon: 'trophy', tone: 'success' },
    partial: { label: 'Logro parcial', icon: 'star', tone: 'warning' },
    lose: { label: 'Derrota valiente', icon: 'shield', tone: 'neutral' },
  };
  const outcome = (o: string | null | undefined) => (o ? OUTCOME[o] ?? { label: o, icon: 'star', tone: 'neutral' as const } : null);
  const APPROACH: Record<string, string> = { brave: 'Con valentía', careful: 'Con prudencia', kind: 'Con cariño', curious: 'Con curiosidad', cunning: 'Con astucia' };

  /** Partida en curso. */
  let play: any = null;
  let scene: any = null;
  /** Fase de la escena en pantalla (la misma que se le manda a la escena compartida). */
  let phase: StoryState['phase'] = 'enter';
  let clip: string | undefined;
  /** Respuesta a la escena actual, mientras se ve su consecuencia. */
  let answer: any = null;
  let ending: any = null;
  /** Objeto que soltó la aventura al terminarla (spec 41). */
  let endingItem: { itemId: string; name: string; qty: number } | null = null;
  let textEl: HTMLElement | null = null;

  $: petName = pet?.nickname || pet?.species?.name || 'Tu Pockai';
  const named = (text: string, name: string) => text.replaceAll('{pet}', name);

  $: remaining = today ? Math.max(0, today.limit - today.used) : 0;
  $: story =
    play && scene
      ? ({
          key: `${play.storyId}:${scene.index}`,
          locationId: scene.locationId,
          phase,
          ...(scene.mood ? { mood: scene.mood } : {}),
          ...(scene.event.fx ? { fx: scene.event.fx } : {}),
          ...(clip ? { clip } : {}),
        } satisfies StoryState)
      : null;

  const load = () => dispatch('retry');

  function open(s: any) {
    if (!pet || busy) return;
    ending = null;
    endingItem = null;
    dispatch('open', s);
  }

  // Una partida nueva abre su primera escena.
  let lastStarted: any = null;
  $: if (started && started !== lastStarted) {
    lastStarted = started;
    play = started;
    if (started.scene) enter(started.scene);
  }

  function enter(next: any) {
    scene = next;
    answer = null;
    clip = undefined;
    phase = 'enter';
  }

  /** Hitos de la escena compartida: marcan el ritmo de la narración. */
  function onBeat(e: CustomEvent<{ key: string; beat: StoryBeat }>) {
    if (!story || e.detail.key !== story.key) return;
    if (e.detail.beat === 'arrived' && phase === 'enter') {
      // Ha llegado al centro: ocurre el evento y aparecen las respuestas
      phase = 'await';
      void focusText();
    } else if (e.detail.beat === 'exited' && phase === 'exit') {
      if (answer?.next) enter(answer.next);
      else finish();
    }
  }

  function choose(i: number) {
    if (!play || !scene || busy || phase !== 'await') return;
    dispatch('choose', { storyId: play.storyId, sceneIndex: scene.index, optionIndex: i });
  }

  // La respuesta del servidor: la consecuencia y la reacción del Pockai.
  let lastAnswered: any = null;
  $: if (answered && answered !== lastAnswered) {
    lastAnswered = answered;
    answer = answered;
    // Reacción: en la última escena depende del resultado; antes, celebra haber decidido
    clip = answered.completed ? (answered.completed.outcome === 'lose' ? 'sad' : 'happy') : 'happy';
    phase = 'react';
    void focusText();
  }

  /** Tras leer la consecuencia: el Pockai sale por la derecha hacia la escena siguiente. */
  function proceed() {
    if (phase === 'react') phase = 'exit';
  }

  function finish() {
    ending = answer?.completed ?? null;
    endingItem = answer?.bonusItem ?? null;
    play = null;
    scene = null;
    answer = null;
    dispatch('finished');
  }

  /** Al cambiar el texto, el foco va a él (los botones anteriores ya no existen). */
  async function focusText() {
    await tick();
    textEl?.focus();
  }

  const pct = (count: number, total: number) => (total > 0 ? Math.round((count / total) * 100) : 0);
</script>


<div class="ui-stack">
  <AsyncState {loading} error={loadError} onRetry={load} rows={3} height={64}>
    {#if play && scene && story}
      <Card variant="hero">
        <FeatureHeader icon="map" title={play.title} sub="Escena {scene.index + 1} de {play.sceneCount}" />
        <StorySceneView {pet} {story} {weather} on:beat={onBeat} />

        <div class="narration" tabindex="-1" aria-live="polite" bind:this={textEl}>
          {#if phase === 'enter'}
            <p class="scene-text ui-usertext">{named(scene.narration, petName)}</p>
          {:else if phase === 'await'}
            <p class="scene-text ui-usertext"><b>{named(scene.event.text, petName)}</b></p>
          {:else if answer}
            <p class="scene-text ui-usertext">{named(answer.consequence, petName)}</p>
          {/if}
        </div>

        {#if phase === 'await'}
          <div class="ui-list">
            {#each scene.choices as c, i}
              <button class="ui-row choice" disabled={busy} on:click={() => choose(i)}>
                <span class="ui-row__rank">{i + 1}</span>
                <span class="ui-row__body">
                  <span class="ui-row__title">{c.label}</span>
                  <span class="ui-row__sub ui-row__sub--wrap">{APPROACH[c.approach] ?? ''}</span>
                </span>
              </button>
            {/each}
          </div>
        {:else if answer && (phase === 'react' || phase === 'exit')}
          <div class="community" aria-label="Lo que ha elegido la comunidad">
            <p class="ui-card__hint">Lo que han elegido los Custodios ({answer.community.total})</p>
            {#each scene.choices as c, i}
              {@const p = pct(answer.community.counts[i] ?? 0, answer.community.total)}
              <div class="vote" class:mine={i === answer.optionIndex}>
                <span class="vote__label">{c.label}{#if i === answer.optionIndex}{' · tú'}{/if}</span>
                <span class="vote__bar" aria-hidden="true"><span style="width: {p}%"></span></span>
                <span class="vote__pct">{p} %</span>
              </div>
            {/each}
          </div>
          <Button variant="primary" block icon="map" disabled={phase === 'exit'} on:click={proceed}>
            {answer.next ? 'Seguir el camino' : 'Terminar la historia'}
          </Button>
        {:else}
          <p class="ui-card__hint center">{petName} sigue su camino…</p>
        {/if}
      </Card>
    {:else}
      <Card variant="hero">
        <FeatureHeader
          icon="map"
          title="Crónica del Éter"
          sub={today ? `${remaining} de ${today.limit} ${today.limit === 1 ? 'historia' : 'historias'} por vivir hoy` : 'Las historias de hoy'}
        />
        {#if ending}
          {@const o = outcome(ending.outcome)}
          <Notice tone={ending.outcome === 'lose' ? 'warning' : ending.outcome === 'partial' ? 'info' : 'ok'} icon={o?.icon}>
            <b>{o?.label}</b> · +{ending.rewards.xp} XP, +{ending.rewards.coins} monedas
            {#if ending.memory}<p class="memory">{ending.memory}</p>{/if}
          </Notice>
          {#if endingItem}
          <Notice tone="ok" icon="gift">¡Ha caído {endingItem.name}! Está en tu Mochila.</Notice>
        {/if}
        {/if}
        {#if !pet}
          <Notice tone="info">Necesitas una mascota activa para vivir una historia.</Notice>
        {/if}
        <div class="ui-list">
          {#each today?.stories ?? [] as s (s.id)}
            {@const o = outcome(s.play?.outcome)}
            {@const done = s.play?.status === 'completed'}
            {@const locked = !s.play && remaining === 0}
            <div class="story" class:done>
              <div class="story__head">
                <span class="story__title">{s.title}</span>
                {#if s.chronicle}<Badge size="sm" tone="accent" icon="book">Crónica · cap. {s.chronicle.chapter}</Badge>{/if}
                {#if s.rerun}<Badge size="sm" title="El Telar ha vuelto sobre una historia antigua">Eco</Badge>{/if}
                {#if done && o}<Badge size="sm" tone={o.tone} icon={o.icon}>{o.label}</Badge>{/if}
              </div>
              <p class="story__synopsis">{s.synopsis}</p>
              {#if s.previously}
                <p class="story__previously"><b>Ayer la mayoría decidió:</b> {s.previously.decided}</p>
              {/if}
              {#if !done}
                <Button
                  variant={s.play ? 'primary' : 'default'}
                  size="sm"
                  icon="map"
                  loading={busy}
                  disabled={!pet || locked}
                  title={locked ? 'Ya has vivido tus historias de hoy' : undefined}
                  on:click={() => open(s)}
                >
                  {s.play ? `Continuar · escena ${s.play.sceneIndex + 1}` : 'Vivir esta historia'}
                </Button>
              {/if}
            </div>
          {:else}
            <EmptyState compact icon="map" text="El Telar aún está tejiendo las historias de hoy. Vuelve en un rato." />
          {/each}
        </div>
        {#if today && remaining === 0 && today.plan === 'free' && today.stories.length > 1}
          <p class="ui-card__hint">Has vivido tu historia de hoy. Con Pro puedes vivir {today.stories.length > 3 ? 3 : today.stories.length} cada día.</p>
        {/if}
      </Card>
    {/if}

    {#if error}<Notice tone="error">{error}</Notice>{/if}

    {#if !play}
      <SectionHeader title="Historias vividas" icon="book" count={history.length} onRefresh={load} {loading} />
      <div class="ui-list">
        {#each history as h (h.storyId)}
          {@const o = outcome(h.outcome)}
          <ListRow
            icon="map"
            title={h.title}
            sub="{new Date(h.startedAt).toLocaleDateString('es-ES')} · {h.answers.map((a: any) => a.label).join(' → ') || 'Sin terminar'}"
          >
            <svelte:fragment slot="end">
              {#if o}<Badge size="sm" tone={o.tone} icon={o.icon}>{o.label}</Badge>{:else}<Badge size="sm">En curso</Badge>{/if}
            </svelte:fragment>
          </ListRow>
        {:else}
          <EmptyState compact icon="map" text="Aún no has vivido ninguna historia." />
        {/each}
      </div>
    {/if}
  </AsyncState>
</div>

<style>
  .narration {
    min-height: 3.2em;
    outline: none;
  }
  .scene-text {
    margin: 0;
    font-size: var(--text-label);
    line-height: 1.55;
  }
  .choice {
    width: 100%;
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .choice:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .choice .ui-row__title {
    white-space: normal;
  }
  .story {
    display: grid;
    gap: var(--space-1);
    padding: var(--space-3);
    border: var(--border-ui, 1px solid var(--line));
    border-radius: var(--radius-cards);
    background: var(--surface);
  }
  .story.done {
    opacity: 0.75;
  }
  .story__head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .story__title {
    font-weight: 700;
  }
  .story__synopsis,
  .story__previously {
    margin: 0;
    font-size: var(--text-caption);
    line-height: 1.45;
  }
  .story__previously {
    font-style: italic;
  }
  .community {
    display: grid;
    gap: var(--space-1);
  }
  .vote {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 30% 3.5em;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-caption);
  }
  .vote.mine .vote__label {
    font-weight: 700;
  }
  .vote__bar {
    height: 8px;
    border-radius: 9999px;
    background: color-mix(in srgb, var(--ink) 12%, transparent);
    overflow: hidden;
  }
  .vote__bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--view-tint, var(--ink));
  }
  .vote__pct {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .memory {
    margin: var(--space-2) 0 0;
    font-size: var(--text-caption);
    font-style: italic;
  }
  .center {
    text-align: center;
  }
</style>
