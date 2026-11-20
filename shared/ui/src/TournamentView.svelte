<script lang="ts">
  /**
   * Torneo: estado, inscripción (con confirmación, porque cuesta gemas), clasificación y cuadro.
   * Solo pinta: el contenedor de cada app carga e inscribe.
   */
  import { createEventDispatcher } from 'svelte';
  import { elementMeta } from './maps';
  import AsyncState from './AsyncState.svelte';
  import Badge from './Badge.svelte';
  import Button from './Button.svelte';
  import Card from './Card.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import EmptyState from './EmptyState.svelte';
  import FeatureHeader from './FeatureHeader.svelte';
  import Ico from './Ico.svelte';
  import ListRow from './ListRow.svelte';
  import Notice from './Notice.svelte';
  import SectionHeader from './SectionHeader.svelte';

  /** Mascota que se inscribe (`nickname`, `species.name`). */
  export let pet: any = null;
  /** `GET /tournament/current`. */
  export let current: any = null;
  /** `GET /tournament/standings`: `{ entries }`. */
  export let standings: any = null;
  /** `GET /tournament/bracket`: `{ rounds }`, o `null` mientras la inscripción sigue abierta. */
  export let bracket: any = null;
  /** No se pudo cargar el cuadro (el resto sí). */
  export let bracketError = false;
  export let loading = false;
  export let error = '';
  /** Inscripción en curso. Al terminar se cierra la confirmación. */
  export let busy = false;
  /** Aviso tras inscribirse. */
  export let enterMsg = '';

  const dispatch = createEventDispatcher<{ refresh: void; enter: void }>();
  const load = () => dispatch('refresh');
  const enter = () => dispatch('enter');

  /** Diálogo de confirmación de la inscripción (gasta gemas). */
  let confirming = false;
  let wasBusy = false;
  $: {
    if (wasBusy && !busy) confirming = false;
    wasBusy = busy;
  }

  const STATUS_LABEL: Record<string, string> = {
    entry: 'Inscripción abierta', bracket: 'Cuadro en curso', active: 'En curso', finished: 'Terminado',
  };

  function statusLabel(s: string): string { return STATUS_LABEL[s] ?? s; }
  function fmt(n: number): string { return n?.toLocaleString?.() ?? String(n); }

  const rounds = (b: any): [string, any[]][] =>
    b && b.rounds ? (Object.entries(b.rounds) as [string, any[]][]).sort((a, z) => Number(a[0]) - Number(z[0])) : [];
</script>


<div class="ui-stack">
  <AsyncState loading={loading && !current} error={current ? '' : error} onRetry={load} rows={3} height={64}>
    {#if current}
      <Card variant="hero" backdrop="tournament">
        <FeatureHeader icon="trophy" title="Torneo" sub="{current.entryCount}/{current.bracketSize} inscritos">
          <svelte:fragment slot="end">
            <Badge tone={current.status === 'finished' ? 'neutral' : 'tint'}>{statusLabel(current.status)}</Badge>
          </svelte:fragment>
        </FeatureHeader>
        <div class="facts">
          <span>Premio total <b>{fmt(current.totalPrizePool)}</b> <Ico n="gem" /></span>
          <span>Cuota <b>{current.entryFee}</b> <Ico n="gem" /></span>
        </div>

        {#if current.status === 'entry'}
          <Notice tone="warning" icon="clock">La inscripción cierra el {new Date(current.entryDeadline).toLocaleString()}</Notice>
          {#if !current.hasEntered}
            <p class="ui-card__hint center">Hace falta un ELO de 1700 o más (liga Diamante). Se consigue ganando en la Arena.</p>
            <Button variant="primary" size="lg" block loading={busy} disabled={!pet} on:click={() => (confirming = true)}>
              {#if pet}Inscribir a mi mascota · {current.entryFee} <Ico n="gem" />{:else}Sin mascota activa{/if}
            </Button>
          {/if}
        {/if}

        {#if current.hasEntered}
          <Notice tone="ok" icon="check">
            Ya estás inscrito{current.myPlacement ? ` · puesto ${current.myPlacement}.º` : ''}
          </Notice>
        {/if}
      </Card>

      {#if enterMsg}<Notice tone="ok">{enterMsg}</Notice>{/if}
      {#if error}<Notice tone="error">{error}</Notice>{/if}

      <SectionHeader title="Clasificación (ELO)" icon="chart" onRefresh={load} {loading} />
      <div class="ui-list">
        {#each standings?.entries ?? [] as e (e.rank)}
          <ListRow rank={e.rank} highlight={e.mine} title={e.petName} value="{fmt(e.elo)} ELO" />
        {:else}
          <EmptyState compact icon="chart" text="Aún sin competidores clasificados." />
        {/each}
      </div>

      {#each rounds(bracket) as [round, matches] (round)}
        <SectionHeader title="Ronda {round}" icon="swords" count={matches.length} />
        <div class="ui-list">
          {#each matches as m (m.id)}
            <div class="ui-row match">
              <span class="side left">
                {#if m.petA}<b title={m.petA.name}>{m.petA.name}</b> <small>{m.petA.elo}</small> <span style="color: {elementMeta(m.petA.element).color}" title={elementMeta(m.petA.element).label} role="img" aria-label={elementMeta(m.petA.element).label}><Ico n={elementMeta(m.petA.element).icon} /></span>{:else}<span class="muted">Por decidir</span>{/if}
              </span>
              <Badge size="sm" tone={m.status === 'resolved' ? 'success' : 'neutral'}>{m.status === 'resolved' || m.status === 'finished' ? 'Jugado' : 'vs'}</Badge>
              <span class="side">
                {#if m.petB}<span style="color: {elementMeta(m.petB.element).color}" title={elementMeta(m.petB.element).label} role="img" aria-label={elementMeta(m.petB.element).label}><Ico n={elementMeta(m.petB.element).icon} /></span> <b title={m.petB.name}>{m.petB.name}</b> <small>{m.petB.elo}</small>{:else}<span class="muted">Por decidir</span>{/if}
              </span>
            </div>
          {/each}
        </div>
      {/each}
      {#if bracketError}
        <Notice tone="warning">No se pudo cargar el cuadro de enfrentamientos.
          <svelte:fragment slot="end"><Button variant="ghost" size="sm" on:click={load}>Reintentar</Button></svelte:fragment>
        </Notice>
      {/if}
    {/if}
  </AsyncState>

  {#if confirming && current}
    <ConfirmDialog
      title="Inscribirse en el torneo"
      icon="trophy"
      confirmLabel="Inscribirme"
      cost={current.entryFee}
      currency="gems"
      loading={busy}
      on:confirm={enter}
      on:cancel={() => (confirming = false)}
    >
      <p>Inscribes a <strong>{pet?.nickname || pet?.species?.name}</strong>. La cuota no se devuelve si te eliminan o si te retiras.</p>
    </ConfirmDialog>
  {/if}
</div>

<style>
  .facts {
    display: flex;
    gap: var(--space-4);
    font-size: var(--text-caption);
    color: var(--ink-muted);
  }
  .facts b {
    color: var(--ink);
  }
  .center {
    text-align: center;
  }
  .match {
    font-size: var(--text-caption);
  }
  .side {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .side.left {
    text-align: right;
  }
  .side small {
    color: var(--ink-muted);
  }
</style>
