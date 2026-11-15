<script lang="ts">
  import Ico from './Ico.svelte';
  import { onMount, createEventDispatcher } from 'svelte';
  import {
    api,
    type Chest,
    type ChestList,
    type OpenChestResponse,
    type ChestHistory,
    type ChestType,
    type DropTier,
  } from '../lib/api';

  const dispatch = createEventDispatcher();

  let chests: ChestList | null = null;
  let me: { coins: number; gems: number } | null = null;
  let history: ChestHistory | null = null;
  let lastOpen: OpenChestResponse | null = null;
  let error = '';
  let loading = true;
  let busyId = '';
  let buying = '';

  const CHEST_ICON: Record<string, string> = {
    bronze: '📦', silver: '🗃️', gold: '🎁', diamond: '💠', mythic: '🌟',
  };
  const TIER_ICON: Record<DropTier, string> = {
    common: '⚪', uncommon: '🟢', rare: '🔵', epic: '🟣', legendary: '🟡',
  };
  const PURCHASABLE: ChestType[] = ['bronze', 'silver', 'gold'];

  function chestIcon(c: Chest): string {
    return CHEST_ICON[c.type] ?? '📦';
  }

  async function load() {
    loading = true;
    error = '';
    lastOpen = null;
    try {
      [chests, me, history] = await Promise.all([
        api.getChests(),
        api.getMe(),
        api.getChestHistory(15, 0),
      ]);
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function open(chest: Chest) {
    busyId = chest.id;
    error = '';
    try {
      lastOpen = await api.openChest(chest.id);
      await load();
      dispatch('refreshUser');
    } catch (e: any) {
      error = e.message;
    } finally {
      busyId = '';
    }
  }

  async function buy(type: ChestType, method: 'coins' | 'gems') {
    buying = `${type}:${method}`;
    error = '';
    try {
      await api.purchaseChest(type, method);
      await load();
      dispatch('refreshUser');
    } catch (e: any) {
      error = e.message;
    } finally {
      buying = '';
    }
  }

  onMount(load);
</script>
{#if loading}
  <div class="empty-msg">Cargando cofres…</div>
{:else if error}
  <div class="error-msg">{error}</div>
{:else if chests}
  <div class="balance">
    <span><Ico n="coin" /> {me?.coins ?? '—'}</span>
    <span><Ico n="gem" /> {me?.gems ?? '—'}</span>
  </div>

  {#if lastOpen}
    <div class="open-result">
      <div class="open-head">{CHEST_ICON[lastOpen.chest.type]} ¡Cofre {lastOpen.chest.type} abierto!</div>
      <div class="drops">
        {#each lastOpen.drops as d (d.itemId + d.tier)}
          <div class="drop" class:legend={d.tier === 'legendary' || d.tier === 'epic'}>
            <span class="drop-tier">{TIER_ICON[d.tier]}</span>
            <span class="drop-name">{d.name}</span>
            <span class="drop-qty">×{d.qty}</span>
            {#if d.isNew}<span class="drop-new">NUEVO</span>{/if}
          </div>
        {:else}
          <div class="empty-msg">Sin drops en esta apertura.</div>
        {/each}
      </div>
      <small class="pity">
        Pity ({lastOpen.pityProgress.minTier}): {lastOpen.pityProgress.count}/{lastOpen.pityProgress.threshold}
      </small>
    </div>
  {/if}

  <div class="sec-title">Mis cofres ({chests.chests.length})</div>
  <div class="chest-grid">
    {#each chests.chests as c (c.id)}
      <button class="chest-card" disabled={busyId === c.id} on:click={() => open(c)}>
        <span class="chest-big">{chestIcon(c)}</span>
        <span class="chest-type">{c.type}</span>
        <span class="chest-src">{c.source}</span>
        <span class="chest-open">{busyId === c.id ? 'Abriendo…' : 'Abrir'}</span>
      </button>
    {:else}
      <div class="empty-msg">No tienes cofres por abrir.</div>
    {/each}
  </div>
  <div class="sec-title">Comprar cofre</div>
  <div class="buy-grid">
    {#each PURCHASABLE as type (type)}
      <div class="buy-card">
        <span class="chest-big">{CHEST_ICON[type]}</span>
        <span class="buy-type">{type}</span>
        <div class="buy-actions">
          <button class="buy-btn coins" disabled={busyId !== '' || buying !== ''} on:click={() => buy(type, 'coins')}>
            {buying === type + ':coins' ? '…' : 'Monedas'}
          </button>
          <button class="buy-btn gems" disabled={busyId !== '' || buying !== ''} on:click={() => buy(type, 'gems')}>
            {buying === type + ':gems' ? '…' : 'Gemas'}
          </button>
        </div>
      </div>
    {/each}
  </div>

  <div class="sec-title">Historial</div>
  <div class="hist-list">
    {#each (history?.openings ?? []) as h (h.openedAt)}
      <div class="hist-row">
        <span class="chest-sm">{CHEST_ICON[h.type]}</span>
        <span class="hist-type">{h.type}</span>
        <span class="hist-drops">
          {#each h.drops.slice(0, 3) as d (d.itemId + d.tier)}
            <span class="drop-chip">{TIER_ICON[d.tier]} {d.name}×{d.qty}</span>
          {/each}
          {#if h.drops.length > 3}<span class="drop-chip">+{h.drops.length - 3}</span>{/if}
        </span>
        <small class="hist-when">{new Date(h.openedAt).toLocaleDateString()}</small>
      </div>
    {:else}
      <div class="empty-msg">Aún no has abierto ningún cofre.</div>
    {/each}
  </div>

  <button class="primary" on:click={load}>↻ Actualizar</button>
{/if}

<style>
  .balance { display: flex; gap: 16px; padding: 8px 10px; border-radius: var(--radius-2xl); background: var(--surface-2); border: 1px solid var(--line-soft); font-size: 14px; font-weight: 700; }
  .error-msg { background: color-mix(in srgb, var(--danger) 20%, var(--surface)); border: 1px solid var(--danger); color: var(--danger-ink); padding: 8px; border-radius: var(--radius-2xl); font-size: 12px; }
  .empty-msg { font-size: 12px; color: var(--ink-muted); text-align: center; padding: 10px 0; }
  .sec-title { font-weight: 700; font-size: 13px; margin: 10px 0 4px; }
  .open-result { margin-top: 8px; padding: 10px; border-radius: var(--radius-2xl); background: var(--surface-2); border: 1px solid var(--accent); display: flex; flex-direction: column; gap: 6px; }
  .open-head { font-weight: 700; font-size: 14px; }
  .drops { display: flex; flex-wrap: wrap; gap: 6px; }
  .drop { display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: var(--radius-2xl); background: var(--surface-2); border: 1px solid var(--line-soft); font-size: 12px; }
  .drop.legend { border-color: var(--color-sunburst); box-shadow: 0 0 8px color-mix(in srgb, var(--color-sunburst) 35%, var(--surface)); }
  .drop-name { font-weight: 600; }
  .drop-qty { color: var(--accent-ink); }
  .drop-new { font-size: 9px; font-weight: 700; color: var(--danger-ink); }
  .pity { font-size: 11px; color: var(--ink-muted); }
  .chest-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: 8px; }
  .chest-card { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 10px 6px; border-radius: var(--radius-2xl); background: var(--surface-2); border: 1px solid var(--line-soft); cursor: pointer; }
  .chest-card:hover { border-color: var(--accent); }
  .chest-card:disabled { opacity: 0.6; cursor: not-allowed; }
  .chest-big { font-size: 28px; }
  .chest-type { font-size: 12px; font-weight: 700; text-transform: capitalize; }
  .chest-src { font-size: 9px; color: var(--ink-muted); }
  .chest-open { font-size: 11px; font-weight: 700; color: var(--accent-ink); }
  .buy-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .buy-card { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 6px; border-radius: var(--radius-2xl); background: var(--surface-2); border: 1px solid var(--line-soft); }
  .buy-type { font-size: 12px; font-weight: 700; text-transform: capitalize; }
  .buy-actions { display: flex; gap: 4px; }
  .buy-btn { padding: 4px 8px; border: none; border-radius: var(--radius-2xl); cursor: pointer; font-weight: 700; font-size: 10px; }
  .buy-btn.coins { background: var(--color-sunburst); color: var(--on-color); }
  .buy-btn.gems { background: var(--accent); color: var(--on-color); }
  .buy-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .hist-list { display: flex; flex-direction: column; gap: 4px; max-height: 200px; overflow-y: auto; }
  .hist-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: var(--radius-2xl); background: var(--surface-2); font-size: 12px; }
  .chest-sm { font-size: 18px; }
  .hist-type { font-weight: 700; width: 52px; text-transform: capitalize; }
  .hist-drops { flex: 1; display: flex; flex-wrap: wrap; gap: 4px; }
  .drop-chip { font-size: 10px; background: var(--surface-2); border: 1px solid var(--line-soft); border-radius: var(--radius-2xl); padding: 1px 6px; }
  .hist-when { color: var(--ink-muted); white-space: nowrap; }
  .primary { margin-top: 10px; padding: 8px; border: none; border-radius: var(--radius-2xl); cursor: pointer; font-weight: 700; background: var(--accent); color: var(--on-color); width: 100%; }
</style>

