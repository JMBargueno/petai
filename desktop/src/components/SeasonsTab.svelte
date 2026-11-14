<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { api, type SeasonCurrent, type SeasonProgress, type SeasonTier } from '../lib/api';

  const dispatch = createEventDispatcher();

  let season: SeasonCurrent | null = null;
  let progress: SeasonProgress | null = null;
  let error = '';
  let loading = true;
  let busy = false;
  let justBought = false;

  const REWARD_ICON: Record<string, string> = { coins: '🪙', gems: '💎', item: '🎁' };

  function fmtMs(ms: number): string {
    if (ms <= 0) return 'Finalizada';
    const d = Math.floor(ms / 86_400_000);
    const h = Math.floor((ms % 86_400_000) / 3_600_000);
    if (d > 0) return `faltan ${d}d ${h}h`;
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return `faltan ${h}h ${m}m`;
  }

  function rewardLabel(r: { type: string; value: number | string }): string {
    return `${REWARD_ICON[r.type] ?? '❔'} ${r.value}`;
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

  $: tierPct =
    progress && season && season.maxTier > 0
      ? Math.min(100, Math.round((progress.currentTier / season.maxTier) * 100))
      : 0;
</script>

{#if loading}
  <div class="empty-msg">Cargando temporada…</div>
{:else if error}
  <div class="error-msg">{error}</div>
{:else if season}
  <div class="season-card">
    <div class="season-head">
      <div>
        <h4>🏆 {season.name}</h4>
        <small>Tema: {season.theme}</small>
      </div>
      <span class="badge">{season.isActive ? fmtMs(season.timeRemainingMs) : 'Finalizada'}</span>
    </div>

    {#if progress && progress.seasonExpired}
      <p class="season-expired">
        Temporada finalizada. ¡Vuelve cuando empiece la próxima!
        {#if season.upcoming}
          <br /><small>Próxima: {season.upcoming.name}</small>
        {/if}
      </p>
    {:else if progress}
      <div class="progress-block">
        <div class="progress-top">
          <span>Nivel {progress.currentTier} / {progress.maxTier}</span>
          <span class="muted">{progress.hasPass ? '💎 Pase activo' : 'Sin pase'}</span>
        </div>
        <div class="progress-bar"><div class="fill" style="width: {tierPct}%"></div></div>
        {#if progress.nextReward}
          <p class="next-reward">
            Siguiente (nivel {progress.nextReward.tier}):
            {#each tierRewards(progress.nextReward) as r}
              <span class="reward-chip">{rewardLabel(r)}</span>
            {/each}
          </p>
        {:else}
          <p class="next-reward">🎉 Nivel máximo alcanzado</p>
        {/if}
      </div>
    {/if}
  </div>

  <div class="pass-block">
    {#if justBought}
      <p class="ok-msg">🎉 ¡Pase de temporada comprado!</p>
    {:else if progress?.hasPass}
      <p class="ok-msg">💎 Ya tienes el pase de esta temporada.</p>
    {:else if season.isActive}
      <button class="primary big" disabled={busy} on:click={buyPass}>
        {busy ? 'Comprando…' : `Comprar pase (${season.passPrice} 💎)`}
      </button>
    {/if}
  </div>

  {#if progress && progress.unlockedTiers.length > 0}
    <div class="sec-title">Niveles desbloqueados</div>
    <div class="tiers-list">
      {#each progress.unlockedTiers as t}
        <div class="tier-row">
          <span class="tier-num">Nv {t.tier}</span>
          <span class="tier-rewards">
            {#each tierRewards(t) as r}
              <span class="reward-chip">{rewardLabel(r)}</span>
            {/each}
          </span>
        </div>
      {/each}
    </div>
  {/if}
{/if}

<style>
  .season-card { padding: 10px; border-radius: 12px; background: rgba(15, 23, 42, 0.55); border: 1px solid rgba(255, 255, 255, 0.1); display: flex; flex-direction: column; gap: 8px; }
  .season-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
  .season-head h4 { margin: 0 0 2px; font-size: 15px; }
  .season-head small { color: #94a3b8; font-size: 11px; }
  .badge { background: rgba(56, 189, 248, 0.2); border: 1px solid #38bdf8; border-radius: 10px; padding: 2px 8px; font-size: 11px; font-weight: 700; white-space: nowrap; }
  .season-expired { font-size: 13px; color: #cbd5e1; text-align: center; }
  .progress-block { display: flex; flex-direction: column; gap: 5px; }
  .progress-top { display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; }
  .muted { opacity: 0.7; font-weight: 400; font-size: 12px; }
  .progress-bar { height: 8px; border-radius: 6px; background: rgba(255, 255, 255, 0.08); overflow: hidden; }
  .progress-bar .fill { height: 100%; background: linear-gradient(90deg, #38bdf8, #22c55e); }
  .next-reward { font-size: 12px; color: #cbd5e1; display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .pass-block { margin: 8px 0; display: flex; flex-direction: column; gap: 4px; }
  .primary { padding: 10px; border: none; border-radius: 10px; cursor: pointer; font-weight: 700; background: #38bdf8; color: #0f172a; }
  .primary.big { width: 100%; padding: 11px; font-size: 14px; }
  .primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .ok-msg { font-size: 13px; color: #4ade80; text-align: center; background: rgba(34, 197, 94, 0.12); border: 1px solid rgba(34, 197, 94, 0.4); border-radius: 10px; padding: 8px; }
  .error-msg { background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #fca5a5; padding: 8px; border-radius: 8px; font-size: 12px; }
  .empty-msg { font-size: 12px; color: #64748b; text-align: center; padding: 12px 0; }
  .sec-title { font-weight: 700; font-size: 13px; margin: 6px 0; }
  .tiers-list { display: flex; flex-direction: column; gap: 4px; max-height: 220px; overflow-y: auto; }
  .tier-row { display: flex; gap: 8px; align-items: center; padding: 6px 8px; border-radius: 8px; background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(255, 255, 255, 0.08); font-size: 12px; }
  .tier-num { font-weight: 700; min-width: 44px; }
  .tier-rewards { display: flex; flex-wrap: wrap; gap: 4px; }
  .reward-chip { background: rgba(30, 41, 59, 0.8); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 12px; padding: 1px 7px; font-size: 11px; }
</style>