<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { api, type RaidCurrent, type RaidLeaderboard, type RaidHistoryEntry } from '../lib/api';

  const dispatch = createEventDispatcher();

  export let pet: any = null;

  let current: RaidCurrent | null = null;
  let board: RaidLeaderboard | null = null;
  let history: RaidHistoryEntry[] = [];
  let error = '';
  let loading = true;
  let busy = false;
  let lastHit = '';
  let settledMsg = '';

  const ELEMENT_ICON: Record<string, string> = {
    fire: '🔥', water: '💧', plant: '🌿', electric: '⚡', shadow: '🌑', light: '☀️',
  };

  function elIcon(e: string): string {
    return ELEMENT_ICON[e] ?? '🎭';
  }

  function hpColor(pct: number): string {
    if (pct > 50) return 'linear-gradient(90deg, #22c55e, #38bdf8)';
    if (pct > 25) return 'linear-gradient(90deg, #eab308, #f97316)';
    return 'linear-gradient(90deg, #ef4444, #f43f5e)';
  }

  async function load() {
    loading = true;
    error = '';
    settledMsg = '';
    try {
      [current, board, history] = await Promise.all([
        api.getRaidCurrent(),
        api.getRaidLeaderboard(10),
        api.getRaidHistory(5),
      ]);
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function attack() {
    if (!pet) return;
    busy = true;
    error = '';
    lastHit = '';
    settledMsg = '';
    try {
      const res = await api.raidAttack(pet.id);
      lastHit = `⚔️ Infligiste ${res.damage.toLocaleString()} de daño (${res.rounds} asaltos).`;
      if (res.settled) settledMsg = '🏆 ¡El boss fue derrotado! Se ha repartido el premio entre los participantes.';
      await load();
      dispatch('refreshPet');
      dispatch('refreshUser');
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = false;
    }
  }

  onMount(load);

  function fmt(n: number): string {
    return n?.toLocaleString?.() ?? String(n);
  }
</script>

{#if loading}
  <div class="empty-msg">Cargando raid…</div>
{:else if error && !current}
  <div class="error-msg">{error}</div>
{:else if current}
  <div class="boss-card">
    <div class="boss-head">
      <span class="boss-icon">{elIcon(current.element)}</span>
      <div class="boss-title">
        <div class="boss-name">{current.theme}</div>
        <small>Nivel {current.level} · Elemento {current.element} · {current.participantCount} participantes</small>
      </div>
    </div>

    <div class="hp-wrap">
      <div class="hp-bar"><div class="hp-fill" style="width: {current.hpPercent}%; background: {hpColor(current.hpPercent)}"></div></div>
      <small class="hp-label">{fmt(current.hpRemaining)} / {fmt(current.hpGlobal)} HP ({current.hpPercent}%)</small>
    </div>

    {#if current.myContribution}
      <div class="my-contrib">
        Tu contribución: <b>{fmt(current.myContribution.damageDealt)}</b> daño
        ({current.myContribution.attacks} ataques, {current.myContribution.percentage}%)
      </div>
    {:else}
      <div class="my-contrib dim">Aún no has atacado a este boss.</div>
    {/if}

    {#if current.status === 'active'}
      <button class="attack" disabled={!pet || busy} on:click={attack}>
        {busy ? 'Atacando…' : pet ? '⚔️ Atacar al boss' : 'Sin mascota activa'}
      </button>
    {:else}
      <div class="settled-badge">🏆 Boss derrotado</div>
    {/if}

    {#if lastHit}<p class="ok-msg">{lastHit}</p>{/if}
    {#if settledMsg}<p class="ok-msg">{settledMsg}</p>{/if}
    {#if error}<div class="error-msg">{error}</div>{/if}
  </div>

  <div class="sec-title">🏅 Top contribuciones</div>
  <div class="board-list">
    {#each (board?.entries ?? []) as e (e.rank)}
      <div class="board-row" class:mine={e.mine}>
        <span class="board-rank">#{e.rank}</span>
        <div class="board-body">
          <div class="board-top">
            <span class="board-name">{elIcon(e.petElement)} {e.displayName}</span>
            <span class="board-dmg">{fmt(e.damageDealt)}</span>
          </div>
          <small class="board-sub">{e.petName} · Nv {e.petLevel} · {e.attacks} ataques · {e.percentage}%</small>
        </div>
      </div>
    {:else}
      <div class="empty-msg">Aún no hay contribuciones.</div>
    {/each}
  </div>

  <div class="sec-title">📜 Raids anteriores</div>
  <div class="hist-list">
    {#each history as h (h.id)}
      <div class="hist-row">
        <span class="hist-icon">{elIcon(h.element)}</span>
        <div class="hist-body">
          <span class="hist-name">{h.theme}</span>
          <small>{fmt(h.hpGlobal)} HP</small>
        </div>
        <span class="hist-status">{h.status === 'settled' ? '✓ liquidado' : h.status}</span>
      </div>
    {:else}
      <div class="empty-msg">Sin raids anteriores.</div>
    {/each}
  </div>

<style>
  .boss-card { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: 12px; background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(255, 255, 255, 0.1); }
  .boss-head { display: flex; gap: 12px; align-items: center; }
  .boss-icon { font-size: 34px; }
  .boss-title { display: flex; flex-direction: column; gap: 2px; }
  .boss-name { font-size: 16px; font-weight: 700; }
  .boss-title small { color: #94a3b8; font-size: 11px; }
  .hp-wrap { display: flex; flex-direction: column; gap: 4px; }
  .hp-bar { height: 12px; border-radius: 6px; background: rgba(255, 255, 255, 0.08); overflow: hidden; }
  .hp-fill { height: 100%; transition: width 0.3s; }
  .hp-label { font-size: 11px; color: #cbd5e1; }
  .my-contrib { font-size: 12px; color: #e2e8f0; }
  .my-contrib.dim { color: #64748b; }
  .attack { padding: 10px; border: none; border-radius: 10px; cursor: pointer; font-weight: 700; font-size: 14px; background: linear-gradient(90deg, #ef4444, #f43f5e); color: #fff; }
  .attack:disabled { opacity: 0.5; cursor: not-allowed; }
  .settled-badge { font-size: 14px; font-weight: 700; color: #4ade80; text-align: center; }
  .ok-msg { font-size: 12px; color: #4ade80; text-align: center; background: rgba(34, 197, 94, 0.12); border: 1px solid rgba(34, 197, 94, 0.4); border-radius: 10px; padding: 8px; margin: 0; }
  .error-msg { background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #fca5a5; padding: 8px; border-radius: 8px; font-size: 12px; }
  .empty-msg { font-size: 12px; color: #64748b; text-align: center; padding: 10px 0; }
  .sec-title { font-weight: 700; font-size: 13px; margin: 12px 0 4px; }
  .board-list, .hist-list { display: flex; flex-direction: column; gap: 6px; }
  .board-row { display: flex; gap: 8px; align-items: center; padding: 8px; border-radius: 10px; background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(255, 255, 255, 0.08); }
  .board-row.mine { border-color: rgba(56, 189, 248, 0.5); }
  .board-rank { width: 26px; text-align: center; font-weight: 700; color: #38bdf8; font-size: 12px; }
  .board-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .board-top { display: flex; justify-content: space-between; gap: 8px; }
  .board-name { font-size: 12px; font-weight: 600; }
  .board-dmg { font-size: 12px; color: #38bdf8; white-space: nowrap; }
  .board-sub { font-size: 10px; color: #94a3b8; }
  .hist-row { display: flex; gap: 10px; align-items: center; padding: 8px; border-radius: 10px; background: rgba(15, 23, 42, 0.4); }
  .hist-icon { font-size: 20px; }
  .hist-body { flex: 1; display: flex; flex-direction: column; gap: 1px; }
  .hist-name { font-size: 12px; font-weight: 600; }
  .hist-body small { font-size: 10px; color: #94a3b8; }
  .hist-status { font-size: 11px; color: #4ade80; }
  .primary { margin-top: 12px; padding: 8px; border: none; border-radius: 8px; cursor: pointer; font-weight: 700; background: #38bdf8; color: #0f172a; width: 100%; }
</style>

  <button class="primary" on:click={load}>↻ Actualizar</button>
{/if}
