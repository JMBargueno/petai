<script lang="ts">
  import Ico from './Ico.svelte';
  import { elementMeta } from '../lib/ui/maps';
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
        error = 'Tienes un entrenamiento a medias: continúa donde lo dejaste.';
      } else {
        error = e.message;
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
      const res = await api.trainingSubmit(pet.id, element, isLastFloor && prediction ? prediction : undefined);
      last = res;
      revealed = { ...revealed, [res.floor]: res.enemyElement };
      hearts = res.hearts;
      currentFloor = res.currentFloor;
      if (res.status !== 'active') {
        active = false;
        finalMsg =
          res.status === 'completed'
            ? `¡Mazmorra superada! +${res.xp ?? 0} XP, +${res.coins ?? 0} monedas` +
              (res.buff ? ` · buff ×${(1 + res.buff.multiplier).toFixed(2)} durante 24 h` : '') +
              (res.predictionBonus ? ' · ¡predicción acertada!' : '')
            : `Te has quedado sin corazones en el piso ${res.floor + 1}.` +
              (res.xp ? ` +${res.xp} XP, +${res.coins ?? 0} monedas` : '');
        await loadBuff();
        dispatch('refreshPet');
        dispatch('refreshUser');
      }
    } catch (e: any) {
      error = e.message;
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
  <Card variant="hero">
    <FeatureHeader
      icon="castle"
      title="Mazmorra elemental"
      sub="5 pisos · elige el elemento con ventaja sobre cada rival · cuesta 10 de energía"
    />
    {#if buff?.active && buff.buff}
      <Notice tone="ok" icon="energy">
        Buff activo: ×{(1 + buff.buff.multiplier).toFixed(2)} a {buff.buff.stats.join(' y ')}
        · {Math.ceil(buff.buff.remainingMs / 3_600_000)} h restantes
      </Notice>
    {/if}

    {#if active}
      <div class="hearts" aria-label="{hearts} corazones">
        {#each Array(3) as _, i}<span class:lost={i >= hearts}><Ico n="heart" size={16} /></span>{/each}
        <Badge size="sm" tone="tint">Piso {Math.min(currentFloor + 1, TOTAL_FLOORS)} de {TOTAL_FLOORS}</Badge>
      </div>
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

    {#if isLastFloor}
      <div class="form-group">
        <label for="train-pred">Predicción (bonus de buff si aciertas el elemento del jefe)</label>
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
  {#if finalMsg}<Notice tone="ok" icon="party">{finalMsg}</Notice>{/if}
  {#if error}<Notice tone="error">{error}</Notice>{/if}
</div>

<style>
  .hearts {
    display: flex;
    align-items: center;
    gap: 4px;
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
