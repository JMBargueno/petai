<script lang="ts">
  import Ico from './Ico.svelte';
  import { onMount, createEventDispatcher } from 'svelte';
  import { api, type TournamentCurrent, type TournamentStandings, type TournamentBracket } from '../lib/api';
  import { elementMeta } from '../lib/ui/maps';
  import { AsyncState, Badge, Button, Card, EmptyState, FeatureHeader, ListRow, Notice, SectionHeader } from './ui';

  const dispatch = createEventDispatcher();

  export let pet: any = null;

  let current: TournamentCurrent | null = null;
  let standings: TournamentStandings | null = null;
  let bracket: TournamentBracket | null = null;
  let error = '';
  let loading = true;
  let busy = false;
  let enterMsg = '';

  const STATUS_LABEL: Record<string, string> = {
    entry: 'Inscripción abierta', bracket: 'Bracket en curso', active: 'En curso', finished: 'Terminado',
  };

  function statusLabel(s: string): string { return STATUS_LABEL[s] ?? s; }
  function fmt(n: number): string { return n?.toLocaleString?.() ?? String(n); }

  async function load() {
    loading = true;
    error = '';
    try {
      current = await api.getTournamentCurrent();
      standings = await api.getTournamentStandings(20);
      // El bracket solo existe cuando el torneo ya pasó la fase de inscripción.
      bracket = current.status !== 'entry'
        ? await api.getTournamentBracket().catch(() => null)
        : null;
    } catch (e: any) {
      error = e.message;
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
      enterMsg = `Inscripción confirmada (ELO ${res.elo}, cuota ${res.feePaid} gemas).`;
      await load();
      dispatch('refreshUser');
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = false;
    }
  }

  onMount(load);

  const rounds = (b: TournamentBracket | null): [string, any[]][] =>
    b && b.rounds ? (Object.entries(b.rounds) as [string, any[]][]).sort((a, z) => Number(a[0]) - Number(z[0])) : [];
</script>

<div class="ui-stack">
  <AsyncState loading={loading && !current} error={current ? '' : error} onRetry={load} rows={3} height={64}>
    {#if current}
      <Card variant="hero">
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
          <Notice tone="warning" icon="clock">Inscripción cierra: {new Date(current.entryDeadline).toLocaleString()}</Notice>
          <Button variant="primary" size="lg" block loading={busy} disabled={!pet || current.hasEntered} on:click={enter}>
            {#if pet}Inscribir a mi mascota · {current.entryFee} <Ico n="gem" />{:else}Sin mascota activa{/if}
          </Button>
          <p class="ui-card__hint center">Requiere ELO ≥ 1700 (liga Diamond)</p>
        {/if}

        {#if current.hasEntered}
          <Notice tone="ok" icon="check">
            Estás inscrito{current.myPlacement ? ` · colocación ${current.myPlacement}º` : ''}
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
                {#if m.petA}<b>{m.petA.name}</b> <small>{m.petA.elo}</small> <span style="color: {elementMeta(m.petA.element).color}"><Ico n={elementMeta(m.petA.element).icon} /></span>{:else}—{/if}
              </span>
              <Badge size="sm" tone={m.status === 'resolved' ? 'success' : 'neutral'}>{m.status === 'resolved' ? 'Fin' : 'vs'}</Badge>
              <span class="side">
                {#if m.petB}<span style="color: {elementMeta(m.petB.element).color}"><Ico n={elementMeta(m.petB.element).icon} /></span> <b>{m.petB.name}</b> <small>{m.petB.elo}</small>{:else}—{/if}
              </span>
            </div>
          {/each}
        </div>
      {/each}
    {/if}
  </AsyncState>
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
