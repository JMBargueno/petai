<script lang="ts">
  import Ico from './Ico.svelte';
  import { elementMeta } from '../lib/ui/maps';
  import { friendlyError } from '../lib/ui/errors';
  import { Badge, Button, Card, FeatureHeader, ListRow, Notice, SectionHeader, TileButton } from './ui';
  import { onMount, createEventDispatcher } from 'svelte';
  import { api, type TrainingElement, type TrainingFloor, type TrainingSubmit, type TrainingBuff } from '../lib/api';

  const dispatch = createEventDispatcher();

  export let pet: any = null;

  const ELEMENTS = ([
    'fire', 'water', 'plant', 'electric', 'shadow', 'light',
  ] as TrainingElement[]).map((id) => ({ id, ...elementMeta(id) }));
  const elLabel = (e: string) => elementMeta(e).label;

  /** Pisos de la mazmorra; `null` si se retoma una sesión iniciada en otro momento. */
  let floors: TrainingFloor[] | null = null;
  let active = false;
  let hearts = 3;
  let currentFloor = 0;
  /** Elemento real de cada piso ya jugado (se descubre al enviar). */
  let revealed: Record<number, TrainingElement> = {};
  let prediction: TrainingElement | '' = '';
  let last: TrainingSubmit | null = null;
  let finalMsg = '';
  let finalOk = true;
  /** Aviso informativo (no es un error): p. ej. que se retoma una sesión a medias. */
  let info = '';
  /** Al retomar una sesión no se conocen corazones ni piso hasta jugar un turno. */
  let unknownState = false;
  let buff: TrainingBuff | null = null;
  let error = '';
  let busy = false;

  const TOTAL_FLOORS = 5;
  $: isLastFloor = currentFloor === TOTAL_FLOORS - 1;

  async function loadBuff() {
    try {
      buff = await api.trainingActiveBuff(pet?.id);
    } catch {
      buff = null;
    }
  }

  async function start() {
    if (!pet) return;
    busy = true;
    error = '';
    finalMsg = '';
    info = '';
    unknownState = false;
    last = null;
    try {
      const res = await api.trainingStart(pet.id);
      floors = res.floors;
      hearts = res.hearts;
      currentFloor = res.currentFloor;
      revealed = {};
      prediction = '';
      active = true;
      dispatch('refreshPet');
    } catch (e: any) {
      if (/sesión de entrenamiento activa/i.test(e.message ?? '')) {
        // Hay una sesión a medias: se puede seguir eligiendo, aunque sin datos de los pisos.
        floors = null;
        active = true;
        unknownState = true;
        info = 'Tienes un entrenamiento a medias: sigue donde lo dejaste. Verás tus corazones y el piso en cuanto elijas un elemento.';
      } else {
        error = friendlyError(e, 'No se pudo empezar el entrenamiento.');
      }
    } finally {
      busy = false;
    }
  }

  async function pick(element: TrainingElement) {
    if (!pet || busy) return;
    busy = true;
    error = '';
    try {
      const res = await api.trainingSubmit(pet.id, element, (isLastFloor || unknownState) && prediction ? prediction : undefined);
      last = res;
      revealed = { ...revealed, [res.floor]: res.enemyElement };
      hearts = res.hearts;
      currentFloor = res.currentFloor;
      unknownState = false;
      info = '';
      if (res.status !== 'active') {
        active = false;
        finalOk = res.status === 'completed';
        finalMsg =
          res.status === 'completed'
            ? `¡Mazmorra superada! +${res.xp ?? 0} XP, +${res.coins ?? 0} monedas` +
              (res.buff ? ` · bonificación ×${(1 + res.buff.multiplier).toFixed(2)} durante 24 h` : '') +
              (res.predictionBonus ? ' · ¡predicción acertada!' : '')
            : `Te has quedado sin corazones en el piso ${res.floor + 1}.` +
              (res.xp ? ` +${res.xp} XP, +${res.coins ?? 0} monedas` : '');
        await loadBuff();
        dispatch('refreshPet');
        dispatch('refreshUser');
      }
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo enviar tu elección.');
      if (/no hay sesión|expirado/i.test(e.message ?? '')) active = false;
    } finally {
      busy = false;
    }
  }

  function resultText(r: TrainingSubmit): string {
    const vs = `${elLabel(r.playerElement)} contra ${elLabel(r.enemyElement)}`;
    if (r.result === 'advanced' || r.result === 'completed') return `${vs}: ¡ventaja elemental! Piso superado.`;
    return `${vs}: sin ventaja, pierdes un corazón.`;
  }

  onMount(loadBuff);
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

    {#if isLastFloor || unknownState}
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
