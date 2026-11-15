<script lang="ts">
  import Ico from './Ico.svelte';
  import { onMount, createEventDispatcher } from 'svelte';
  import { api, type Mission, type MissionList, type MissionSummary } from '../lib/api';

  const dispatch = createEventDispatcher();

  let data: MissionList | null = null;
  let summary: MissionSummary | null = null;
  let error = '';
  let loading = true;
  let busyId = '';
  let claimedMsg = '';

  const REASON_ICON: Record<string, string> = {
    feed: '🍎', battle: '⚔️', minigame: '🎮', chat: '💬', clean: '🧼',
    sleep: '😴', evolve: '✨', hatch: '🥚', level_up: '⬆️', battle_win: '🏆', hatch_rare: '🎲',
  };

  function missionIcon(m: Mission): string {
    return REASON_ICON[m.type] ?? '🎯';
  }

  function rewardLabel(m: Mission): string {
    const parts: string[] = [];
    if (m.reward.coins) parts.push(`${m.reward.coins} monedas`);
    if (m.reward.gems) parts.push(`${m.reward.gems} gemas`);
    if (m.reward.xp) parts.push(`${m.reward.xp} XP`);
    return parts.join(' · ') || '—';
  }

  async function load() {
    loading = true;
    error = '';
    claimedMsg = '';
    try {
      [data, summary] = await Promise.all([api.getMissions(), api.getMissionsSummary()]);
    } catch (e: any) {
      error = e.message;
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
      claimedMsg = `¡Recibiste ${rewardLabel(m)}!`;
      await load();
      dispatch('refreshUser');
      if (res.dailyChestUnlocked) claimedMsg += ' · Cofre diario desbloqueado';
    } catch (e: any) {
      error = e.message;
    } finally {
      busyId = '';
    }
  }

  onMount(load);

  function pct(m: Mission): number {
    return m.target > 0 ? Math.min(100, Math.round((m.current / m.target) * 100)) : 0;
  }
</script>
{#if loading}
  <div class="empty-msg">Cargando misiones…</div>
{:else if error}
  <div class="error-msg">{error}</div>
{:else if data}
  {#if summary}
    <div class="summary">
      <div class="summary-item">
        <span class="s-num">{summary.dailyCompleted}/{summary.dailyTotal}</span>
        <small>diarias</small>
      </div>
      <div class="summary-item">
        <span class="s-num">{summary.weeklyCompleted}/{summary.weeklyTotal}</span>
        <small>semanales</small>
      </div>
      <div class="summary-item">
        <span class="s-num"><Ico n="flame" /> {summary.streak}</span>
        <small>días (récord {summary.bestStreak})</small>
      </div>
      <div class="summary-item">
        <span class="s-num"><Ico n={data.dailyChestUnlocked ? 'gift' : 'lock'} /></span>
        <small>cofre diario</small>
      </div>
    </div>
    {#if claimedMsg}
      <p class="ok-msg">{claimedMsg}</p>
    {/if}
  {/if}

  <div class="sec-title">Misiones diarias</div>
  <div class="mission-list">
    {#each data.daily as m (m.id)}
      <div class="mission-row" class:done={m.completed}>
        <span class="m-icon">{missionIcon(m)}</span>
        <div class="m-body">
          <div class="m-top">
            <span class="m-desc">{m.description}</span>
            <span class="m-reward">{rewardLabel(m)}</span>
          </div>
          <div class="m-prog"><div class="fill" style="width: {pct(m)}%"></div></div>
          <small class="m-progress">{m.current}/{m.target}</small>
        </div>
        {#if m.completed}
          <button class="claim" disabled={busyId === m.id} on:click={() => claim(m)}>
            {busyId === m.id ? '…' : 'Reclamar'}
          </button>
        {/if}
      </div>
    {:else}
      <div class="empty-msg">Sin misiones diarias activas.</div>
    {/each}
  </div>

  <div class="sec-title">Misiones semanales</div>
  <div class="mission-list">
    {#each data.weekly as m (m.id)}
      <div class="mission-row" class:done={m.completed}>
        <span class="m-icon">{missionIcon(m)}</span>
        <div class="m-body">
          <div class="m-top">
            <span class="m-desc">{m.description}</span>
            <span class="m-reward">{rewardLabel(m)}</span>
          </div>
          <div class="m-prog"><div class="fill" style="width: {pct(m)}%"></div></div>
          <small class="m-progress">{m.current}/{m.target}</small>
        </div>
        {#if m.completed}
          <button class="claim" disabled={busyId === m.id} on:click={() => claim(m)}>
            {busyId === m.id ? '…' : 'Reclamar'}
          </button>
        {/if}
      </div>
    {:else}
      <div class="empty-msg">Sin misiones semanales activas.</div>
    {/each}
  </div>

  <button class="primary" on:click={load}>↻ Actualizar</button>
{/if}
<style>
  .summary { display: flex; gap: 8px; margin-bottom: 8px; }
  .summary-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px; border-radius: var(--radius-2xl); background: var(--surface-2); border: 1px solid var(--line-soft); }
  .s-num { font-size: 15px; font-weight: 700; }
  .summary-item small { color: var(--ink-muted); font-size: 10px; }
  .ok-msg { font-size: 13px; color: var(--success-ink); text-align: center; background: color-mix(in srgb, var(--success) 12%, var(--surface)); border: 1px solid var(--success); border-radius: var(--radius-2xl); padding: 8px; margin-bottom: 8px; }
  .error-msg { background: color-mix(in srgb, var(--danger) 20%, var(--surface)); border: 1px solid var(--danger); color: var(--danger-ink); padding: 8px; border-radius: var(--radius-2xl); font-size: 12px; }
  .empty-msg { font-size: 12px; color: var(--ink-muted); text-align: center; padding: 10px 0; }
  .sec-title { font-weight: 700; font-size: 13px; margin: 8px 0 4px; }
  .mission-list { display: flex; flex-direction: column; gap: 6px; }
  .mission-row { display: flex; gap: 10px; align-items: center; padding: 8px; border-radius: var(--radius-2xl); background: var(--surface-2); border: 1px solid var(--line-soft); }
  .mission-row.done { border-color: var(--success); }
  .m-icon { font-size: 22px; }
  .m-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .m-top { display: flex; justify-content: space-between; gap: 8px; }
  .m-desc { font-size: 12px; font-weight: 600; }
  .m-reward { font-size: 11px; color: var(--accent-ink); white-space: nowrap; }
  .m-prog { height: 6px; border-radius: var(--radius-2xl); background: color-mix(in srgb, var(--ink) 6%, transparent); overflow: hidden; }
  .m-prog .fill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--success)); }
  .m-progress { font-size: 10px; color: var(--ink-muted); }
  .claim { padding: 6px 10px; border: none; border-radius: var(--radius-2xl); cursor: pointer; font-weight: 700; font-size: 11px; background: var(--success); color: var(--on-color); white-space: nowrap; }
  .claim:disabled { opacity: 0.5; cursor: not-allowed; }
  .primary { margin-top: 10px; padding: 8px; border: none; border-radius: var(--radius-2xl); cursor: pointer; font-weight: 700; background: var(--accent); color: var(--on-color); width: 100%; }
</style>

