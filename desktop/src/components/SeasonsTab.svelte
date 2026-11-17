<script lang="ts">
  import Ico from './Ico.svelte';
  import { onMount, createEventDispatcher } from 'svelte';
  import { api, type SeasonCurrent, type SeasonProgress, type SeasonTier } from '../lib/api';
  import { rewardIcon } from '../lib/ui/maps';
  import { AsyncState, Badge, Button, Card, FeatureHeader, ListRow, Notice, ProgressBar, SectionHeader } from './ui';

  const dispatch = createEventDispatcher();

  let season: SeasonCurrent | null = null;
  let progress: SeasonProgress | null = null;
  let error = '';
  let loading = true;
  let busy = false;
  let justBought = false;

  function fmtMs(ms: number): string {
    if (ms <= 0) return 'Finalizada';
    const d = Math.floor(ms / 86_400_000);
    const h = Math.floor((ms % 86_400_000) / 3_600_000);
    if (d > 0) return `faltan ${d}d ${h}h`;
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return `faltan ${h}h ${m}m`;
  }

  function tierRewards(t: SeasonTier): { type: string; value: number | string }[] {
    return [...t.freeRewards, ...(t.premiumRewards ?? [])];
  }

  async function load() {
    loading = true;
    error = '';
    justBought = false;
    try {
      [season, progress] = await Promise.all([api.getSeasonCurrent(), api.getSeasonProgress()]);
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function buyPass() {
    if (!season) return;
    busy = true;
    error = '';
    try {
      await api.purchaseSeasonPass();
      justBought = true;
      await load();
      dispatch('refreshUser');
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = false;
    }
  }

  onMount(load);
</script>

<div class="ui-stack">
  <AsyncState {loading} {error} onRetry={load} rows={3} height={64}>
    {#if season}
      <Card variant="hero">
        <FeatureHeader icon="trophy" title={season.name} sub="Tema: {season.theme}">
          <svelte:fragment slot="end">
            <Badge tone={season.isActive ? 'tint' : 'neutral'} icon="clock">
              {season.isActive ? fmtMs(season.timeRemainingMs) : 'Finalizada'}
            </Badge>
          </svelte:fragment>
        </FeatureHeader>

        {#if progress && progress.seasonExpired}
          <Notice tone="info">
            Temporada finalizada. ¡Vuelve cuando empiece la próxima!
            {#if season.upcoming}<br /><small>Próxima: {season.upcoming.name}</small>{/if}
          </Notice>
        {:else if progress}
          <ProgressBar
            value={progress.currentTier}
            max={season.maxTier || progress.maxTier}
            label="Nivel {progress.currentTier} / {progress.maxTier}"
            detail={progress.hasPass ? 'Pase activo' : 'Sin pase'}
          />
          {#if progress.nextReward}
            <div class="rewards">
              <span class="muted">Siguiente (nivel {progress.nextReward.tier}):</span>
              {#each tierRewards(progress.nextReward) as r}
                <Badge size="sm" icon={rewardIcon(r.type)}>{r.value}</Badge>
              {/each}
            </div>
          {:else}
            <div class="rewards"><Ico n="party" /> Nivel máximo alcanzado</div>
          {/if}
        {/if}
      </Card>

      {#if justBought}
        <Notice tone="ok" icon="party">¡Pase de temporada comprado!</Notice>
      {:else if progress?.hasPass}
        <Notice tone="ok" icon="gem">Ya tienes el pase de esta temporada.</Notice>
      {:else if season.isActive}
        <Button variant="primary" size="lg" block loading={busy} on:click={buyPass}>
          Comprar pase · {season.passPrice} <Ico n="gem" />
        </Button>
      {/if}

      {#if progress && progress.unlockedTiers.length > 0}
        <SectionHeader title="Niveles desbloqueados" icon="unlock" count={progress.unlockedTiers.length} onRefresh={load} {loading} />
        <div class="ui-list ui-list--scroll">
          {#each progress.unlockedTiers as t}
            <ListRow rank={null} title="Nivel {t.tier}">
              <svelte:fragment slot="end">
                {#each tierRewards(t) as r}
                  <Badge size="sm" icon={rewardIcon(r.type)}>{r.value}</Badge>
                {/each}
              </svelte:fragment>
            </ListRow>
          {/each}
        </div>
      {/if}
    {/if}
  </AsyncState>
</div>

<style>
  .rewards {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    font-size: 12px;
  }
</style>
