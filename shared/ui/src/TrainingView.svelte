<script lang="ts">
  /**
   * Entrenamiento: la mazmorra elemental de 5 pisos. Solo pinta: la sesión (`TrainingSession`, de
   * `./training`) la guarda el contenedor de cada app, que empieza, envía cada elección y la pasa
   * por `trainingAfterSubmit`.
   */
  import { createEventDispatcher } from 'svelte';
  import { elementMeta } from './maps';
  import {
    TRAINING_ELEMENTS,
    TRAINING_FLOORS as TOTAL_FLOORS,
    TRAINING_IDLE,
    trainingAsksPrediction,
    trainingResultText as resultText,
    type TrainingSession,
  } from './training';
  import Badge from './Badge.svelte';
  import Button from './Button.svelte';
  import Card from './Card.svelte';
  import FeatureHeader from './FeatureHeader.svelte';
  import Ico from './Ico.svelte';
  import ListRow from './ListRow.svelte';
  import Notice from './Notice.svelte';
  import SectionHeader from './SectionHeader.svelte';
  import TileButton from './TileButton.svelte';

  /** Mascota que entrena. */
  export let pet: any = null;
  /** `GET /training/active-buff`: `{ active, buff }`. */
  export let buff: any = null;
  export let session: TrainingSession = TRAINING_IDLE;
  /** Petición en curso (empezar o elegir). */
  export let busy = false;
  export let error = '';

  const dispatch = createEventDispatcher<{ start: void; pick: { element: string; prediction: string | null } }>();

  const ELEMENTS = TRAINING_ELEMENTS.map((id) => ({ id, ...elementMeta(id) }));

  /** Predicción para el jefe final; se olvida al empezar otra mazmorra. */
  let prediction = '';

  function start() {
    prediction = '';
    dispatch('start');
  }

  function pick(element: string) {
    if (busy) return;
    dispatch('pick', { element, prediction: askPrediction && prediction ? prediction : null });
  }

  $: ({ floors, active, hearts, currentFloor, revealed, last, finalMsg, finalOk, info, unknownState } = session);
  $: askPrediction = trainingAsksPrediction(session);
</script>


<div class="ui-stack">
  <Card variant="hero" backdrop="training">
    <FeatureHeader
      icon="castle"
      title="Mazmorra elemental"
      sub="5 pisos · elige el elemento con ventaja sobre cada rival · cuesta 10 de energía"
    />
    {#if buff?.active && buff.buff}
      <Notice tone="ok" icon="energy">
        Bonificación activa: ×{(1 + buff.buff.multiplier).toFixed(2)} a {buff.buff.stats.join(' y ')}
        · {Math.ceil(buff.buff.remainingMs / 3_600_000)} h restantes
      </Notice>
    {/if}

    {#if active}
      {#if unknownState}
        <Badge size="sm" tone="neutral" icon="wait">Sesión retomada</Badge>
      {:else}
        <div class="hearts" role="img" aria-label="Te quedan {hearts} de 3 corazones">
          {#each Array(3) as _, i}<span class:lost={i >= hearts} aria-hidden="true"><Ico n="heart" size={16} /></span>{/each}
          <Badge size="sm" tone="tint">Piso {Math.min(currentFloor + 1, TOTAL_FLOORS)} de {TOTAL_FLOORS}</Badge>
        </div>
      {/if}
    {:else}
      <Button variant="primary" size="lg" block icon="swords" loading={busy} disabled={!pet} on:click={start}>
        {pet ? 'Entrar en la mazmorra' : 'Sin mascota activa'}
      </Button>
    {/if}
  </Card>

  {#if active}
    {#if floors}
      <SectionHeader title="Pisos" icon="castle" />
      <div class="ui-list">
        {#each floors as f (f.floor)}
          <ListRow
            rank={f.floor + 1}
            icon={revealed[f.floor] ? elementMeta(revealed[f.floor]).icon : 'help'}
            iconTint={revealed[f.floor] ? elementMeta(revealed[f.floor]).color : null}
            title={f.enemyName}
            sub="Nv {f.enemyLevel}"
            highlight={f.floor === currentFloor}
            muted={f.floor < currentFloor}
          />
        {/each}
      </div>
    {/if}

    {#if askPrediction}
      <div class="form-group">
        <label for="train-pred">Predicción para el jefe final (si aciertas su elemento, la bonificación es mayor)</label>
        <select id="train-pred" class="select" bind:value={prediction}>
          <option value="">Sin predicción</option>
          {#each ELEMENTS as el}<option value={el.id}>{el.label}</option>{/each}
        </select>
      </div>
    {/if}

    <SectionHeader title="¿Con qué elemento atacas?" icon="target" />
    <div class="ui-tiles elements">
      {#each ELEMENTS as el}
        <TileButton icon={el.icon} color={el.color} label={el.label} disabled={busy} on:click={() => pick(el.id)} />
      {/each}
    </div>
  {/if}

  {#if last && active}<Notice tone={last.result === 'advanced' || last.result === 'completed' ? 'ok' : 'warning'}>{resultText(last)}</Notice>{/if}
  {#if info}<Notice tone="info">{info}</Notice>{/if}
  {#if finalMsg}<Notice tone={finalOk ? 'ok' : 'warning'} icon={finalOk ? 'party' : 'heart'}>{finalMsg}</Notice>{/if}
  {#if error}<Notice tone="error">{error}</Notice>{/if}
</div>

<style>
  .hearts {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--danger);
  }
  .hearts .lost {
    color: var(--ink-muted);
    opacity: 0.35;
  }
  .hearts :global(.ui-badge) {
    margin-left: auto;
  }
  .elements {
    grid-template-columns: repeat(3, 1fr);
  }
</style>
