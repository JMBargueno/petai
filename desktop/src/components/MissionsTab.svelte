<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { api, type Mission, type MissionList, type MissionSummary } from '../lib/api';
  import { reasonIcon } from '../lib/ui/maps';
  import { friendlyError } from '../lib/ui/errors';
  import { AsyncState, Badge, Button, EmptyState, ListRow, Notice, ProgressBar, SectionHeader, StatTile } from './ui';

  const dispatch = createEventDispatcher();

  let data: MissionList | null = null;
  let summary: MissionSummary | null = null;
  let error = '';
  let loading = true;
  let busyId = '';
  let claimedMsg = '';

  function rewardLabel(m: Mission): string {
    const parts: string[] = [];
    if (m.reward.coins) parts.push(`${m.reward.coins} monedas`);
    if (m.reward.gems) parts.push(`${m.reward.gems} gemas`);
    if (m.reward.xp) parts.push(`${m.reward.xp} XP`);
    return parts.join(' · ') || '—';
  }

  /** `keepMsg`: recarga tras reclamar, sin borrar el aviso de la recompensa. */
  async function load(keepMsg = false) {
    loading = true;
    error = '';
    if (!keepMsg) claimedMsg = '';
    try {
      [data, summary] = await Promise.all([api.getMissions(), api.getMissionsSummary()]);
    } catch (e: any) {
      error = friendlyError(e, 'No se pudieron cargar las misiones.');
    } finally {
      loading = false;
    }
  }

  async function claim(m: Mission) {
    busyId = m.id;
    error = '';
    claimedMsg = '';
    try {
      const res = await api.claimMission(m.id);
      claimedMsg = `Has recibido ${rewardLabel(m)}.` + (res.dailyChestUnlocked ? ' ¡Y has desbloqueado el cofre diario! Ábrelo en Tienda › Cofres.' : '');
      await load(true);
      dispatch('refreshUser');
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo reclamar la recompensa.');
    } finally {
      busyId = '';
    }
  }

  onMount(() => load());

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
