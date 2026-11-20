<script lang="ts">
  /**
   * Misiones diarias y semanales, con su resumen y el botón de reclamar. Solo pinta: los datos
   * llegan por props y el contenedor de cada app carga, reclama y dice cómo ha ido.
   */
  import { createEventDispatcher } from 'svelte';
  import { reasonIcon } from './maps';
  import { missionRewardLabel as rewardLabel } from './missions';
  import AsyncState from './AsyncState.svelte';
  import Badge from './Badge.svelte';
  import Button from './Button.svelte';
  import EmptyState from './EmptyState.svelte';
  import ListRow from './ListRow.svelte';
  import Notice from './Notice.svelte';
  import ProgressBar from './ProgressBar.svelte';
  import SectionHeader from './SectionHeader.svelte';
  import StatTile from './StatTile.svelte';

  /** Lo que devuelve el servidor: `{ daily, weekly, dailyChestUnlocked }`. */
  export let data: any = null;
  /** Resumen (completadas, racha). Opcional. */
  export let summary: any = null;
  export let loading = false;
  export let error = '';
  /** Misión que se está reclamando ahora. */
  export let busyId = '';
  /** Aviso tras reclamar una recompensa. */
  export let claimedMsg = '';

  const dispatch = createEventDispatcher<{ refresh: void; claim: any }>();
  const load = () => dispatch('refresh');
  const claim = (mission: any) => dispatch('claim', mission);

  $: groups = data
    ? [
        { title: 'Misiones diarias', icon: 'clock', items: data.daily, empty: 'Sin misiones diarias activas.' },
        { title: 'Misiones semanales', icon: 'target', items: data.weekly, empty: 'Sin misiones semanales activas.' },
      ]
    : [];
</script>

<div class="ui-stack">
  <AsyncState {loading} {error} onRetry={() => load()} rows={4}>
    {#if data}
      {#if summary}
        <div class="ui-stats">
          <StatTile value="{summary.dailyCompleted}/{summary.dailyTotal}" label="diarias" />
          <StatTile value="{summary.weeklyCompleted}/{summary.weeklyTotal}" label="semanales" />
          <StatTile icon="flame" value={summary.streak} label="días (récord {summary.bestStreak})" />
          <StatTile icon={data.dailyChestUnlocked ? 'gift' : 'lock'} value={data.dailyChestUnlocked ? 'Listo' : 'Bloqueado'} label="cofre diario" />
        </div>
      {/if}
      {#if claimedMsg}<Notice tone="ok" icon="party">{claimedMsg}</Notice>{/if}

      {#each groups as g, i (g.title)}
        <SectionHeader title={g.title} icon={g.icon} count={g.items.length} onRefresh={i === 0 ? () => load() : null} {loading} />
        <div class="ui-list">
          {#each g.items as m (m.id)}
            <ListRow icon={reasonIcon(m.type)} title={m.description} done={m.completed && !m.claimed} muted={m.claimed} wrap>
              <div class="m-meta">
                <ProgressBar value={m.current} max={m.target} size="sm" />
                <small>{Math.min(m.current, m.target)}/{m.target} · Recompensa: {rewardLabel(m)}</small>
              </div>
              <svelte:fragment slot="end">
                {#if m.completed}
                  {#if m.claimed}
                    <Badge tone="success" icon="check" title="Recompensa ya reclamada">Reclamada</Badge>
                  {:else}
                    <Button variant="success" size="sm" loading={busyId === m.id} on:click={() => claim(m)}>Reclamar</Button>
                  {/if}
                {/if}
              </svelte:fragment>
            </ListRow>
          {:else}
            <EmptyState compact icon={g.icon} text={g.empty} />
          {/each}
        </div>
      {/each}
    {/if}
  </AsyncState>
</div>

<style>
  .m-meta {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: var(--space-1);
  }
  .m-meta small {
    font-size: var(--text-caption);
    color: var(--ink-muted);
  }
  .ui-list :global(.ui-row__title) {
    white-space: normal;
  }
</style>
