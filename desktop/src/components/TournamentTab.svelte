<script lang="ts">
  import Ico from './Ico.svelte';
  import { onMount, createEventDispatcher } from 'svelte';
  import { api, type TournamentCurrent, type TournamentStandings, type TournamentBracket } from '../lib/api';
  import { elementMeta } from '../lib/ui/maps';
  import { AsyncState, Badge, Button, Card, ConfirmDialog, EmptyState, FeatureHeader, ListRow, Notice, SectionHeader } from './ui';
  import { friendlyError } from '../lib/ui/errors';

  const dispatch = createEventDispatcher();

  export let pet: any = null;

  let current: TournamentCurrent | null = null;
  let standings: TournamentStandings | null = null;
  let bracket: TournamentBracket | null = null;
  let error = '';
  let loading = true;
  let busy = false;
  let bracketError = false;
  let enterMsg = '';
  /** Diálogo de confirmación de la inscripción (gasta gemas). */
  let confirming = false;

  const STATUS_LABEL: Record<string, string> = {
    entry: 'Inscripción abierta', bracket: 'Cuadro en curso', active: 'En curso', finished: 'Terminado',
  };

  function statusLabel(s: string): string { return STATUS_LABEL[s] ?? s; }
  function fmt(n: number): string { return n?.toLocaleString?.() ?? String(n); }

  async function load() {
    loading = true;
    error = '';
    try {
      [current, standings] = await Promise.all([api.getTournamentCurrent(), api.getTournamentStandings(20)]);
      // El cuadro solo existe cuando el torneo ya pasó la fase de inscripción.
      bracketError = false;
      bracket = current.status !== 'entry'
        ? await api.getTournamentBracket().catch(() => ((bracketError = true), null))
        : null;
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo cargar el torneo.');
    } finally {
      loading = false;
    }
  }

  async function enter() {
    if (!pet) return;
    busy = true;
    error = '';
    enterMsg = '';
    try {
      const res = await api.tournamentEnter(pet.id);
      enterMsg = `Inscripción confirmada. Entras con ${res.elo} de ELO y has pagado ${res.feePaid} gemas.`;
      await load();
      dispatch('refreshUser');
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo completar la inscripción.');
    } finally {
      busy = false;
      confirming = false;
    }
  }

  onMount(load);

  const rounds = (b: TournamentBracket | null): [string, any[]][] =>
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
