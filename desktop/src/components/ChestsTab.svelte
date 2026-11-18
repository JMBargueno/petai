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
  import { AsyncState, Badge, Button, Card, CurrencyPill, EmptyState, ListRow, SectionHeader, TileButton } from './ui';

  const dispatch = createEventDispatcher();

  let chests: ChestList | null = null;
  let me: { coins: number; gems: number } | null = null;
  let history: ChestHistory | null = null;
  let lastOpen: OpenChestResponse | null = null;
  let error = '';
  let loading = true;
  let busyId = '';
  let buying = '';

  /** Color de cada cofre / tier de drop (tokens de rareza). */
  const CHEST_COLOR: Record<string, string> = {
    bronze: 'var(--color-ember)',
    silver: 'var(--color-concrete-gray)',
    gold: 'var(--color-sunburst)',
    diamond: 'var(--color-electric-blue)',
    mythic: 'var(--rarity-mythic)',
  };
  const CHEST_LABEL: Record<string, string> = {
    bronze: 'Bronce', silver: 'Plata', gold: 'Oro', diamond: 'Diamante', mythic: 'Mítico',
  };
  const TIER_COLOR: Record<DropTier, string> = {
    common: 'var(--rarity-common)',
    uncommon: 'var(--rarity-common)',
    rare: 'var(--rarity-rare)',
    epic: 'var(--rarity-super-rare)',
    legendary: 'var(--rarity-legendary)',
  };
  const PURCHASABLE: ChestType[] = ['bronze', 'silver', 'gold'];

  const label = (t: string) => CHEST_LABEL[t] ?? t;

  async function load() {
    loading = true;
    error = '';
    lastOpen = null;
    try {
      [chests, me, history] = await Promise.all([api.getChests(), api.getMe(), api.getChestHistory(15, 0)]);
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
      const opened = lastOpen;
      await load();
      lastOpen = opened;
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

<div class="ui-stack">
  <AsyncState {loading} {error} onRetry={load} rows={4}>
    {#if chests}
      <div class="balance">
        <span class="label-caps muted">Saldo</span>
        <CurrencyPill kind="coins" amount={me?.coins ?? '—'} />
        <CurrencyPill kind="gems" amount={me?.gems ?? '—'} />
      </div>

      {#if lastOpen}
        <Card variant="pop" title="¡Cofre {label(lastOpen.chest.type)} abierto!" icon="party">
          <div class="drops">
            {#each lastOpen.drops as d (d.itemId + d.tier)}
              <Badge color={TIER_COLOR[d.tier]}>
                {d.name} ×{d.qty}{#if d.isNew}&nbsp;· NUEVO{/if}
              </Badge>
            {:else}
              <span class="muted">Sin drops en esta apertura.</span>
            {/each}
          </div>
          <p class="ui-card__hint">
            Pity ({lastOpen.pityProgress.minTier}): {lastOpen.pityProgress.count}/{lastOpen.pityProgress.threshold}
          </p>
        </Card>
      {/if}

      <SectionHeader title="Mis cofres" icon="gift" count={chests.chests.length} onRefresh={load} {loading} />
      {#if chests.chests.length}
        <div class="ui-tiles">
          {#each chests.chests as c (c.id)}
            <TileButton
              icon="gift"
              color={CHEST_COLOR[c.type]}
              label={label(c.type)}
              sub={busyId === c.id ? 'Abriendo…' : c.source}
              disabled={busyId !== ''}
              title="Abrir cofre"
              on:click={() => open(c)}
            />
          {/each}
        </div>
      {:else}
        <EmptyState compact icon="gift" text="No tienes cofres por abrir." />
      {/if}

      <SectionHeader title="Comprar cofre" icon="shop" />
      <div class="buy-grid">
        {#each PURCHASABLE as type (type)}
          <Card size="sm" variant="flat">
            <div class="buy-head">
              <span class="ui-row__lead" style="background: color-mix(in srgb, {CHEST_COLOR[type]} 45%, var(--surface)); color: var(--on-color)">
                <Ico n="gift" size={14} />
              </span>
              <strong>{label(type)}</strong>
            </div>
            <Button size="sm" block icon="coin" loading={buying === type + ':coins'} disabled={busyId !== '' || buying !== ''} on:click={() => buy(type, 'coins')}>Monedas</Button>
            <Button size="sm" block icon="gem" loading={buying === type + ':gems'} disabled={busyId !== '' || buying !== ''} on:click={() => buy(type, 'gems')}>Gemas</Button>
          </Card>
        {/each}
      </div>

      <SectionHeader title="Historial" icon="log" />
      <div class="ui-list ui-list--scroll">
        {#each history?.openings ?? [] as h (h.openedAt)}
          <ListRow icon="gift" iconTint={CHEST_COLOR[h.type]} title={label(h.type)} sub={new Date(h.openedAt).toLocaleDateString()}>
            <div class="drops">
              {#each h.drops.slice(0, 3) as d (d.itemId + d.tier)}
                <Badge size="sm" color={TIER_COLOR[d.tier]}>{d.name} ×{d.qty}</Badge>
              {/each}
              {#if h.drops.length > 3}<Badge size="sm">+{h.drops.length - 3}</Badge>{/if}
            </div>
          </ListRow>
        {:else}
          <EmptyState compact icon="log" text="Aún no has abierto ningún cofre." />
        {/each}
      </div>
    {/if}
  </AsyncState>
</div>

<style>
  .balance {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .balance .label-caps {
    margin-right: auto;
  }
  .drops {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-top: 2px;
  }
  .buy-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-2);
  }
  .buy-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-label);
  }
  .buy-head .ui-row__lead {
    width: 26px;
    height: 26px;
  }
</style>
