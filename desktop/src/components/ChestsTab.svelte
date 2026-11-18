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
  import { AsyncState, Badge, Button, Card, ConfirmDialog, CurrencyPill, EmptyState, ListRow, Notice, SectionHeader, TileButton } from './ui';
  import { friendlyError } from '../lib/ui/errors';
  // Los precios son los mismos datos de equilibrio que usa el servidor para cobrar.
  import balance from '@shared/game-data/balance.json';

  const dispatch = createEventDispatcher();

  let chests: ChestList | null = null;
  let me: { coins: number; gems: number } | null = null;
  let history: ChestHistory | null = null;
  let lastOpen: OpenChestResponse | null = null;
  let error = '';
  let loading = true;
  let busyId = '';
  let buying = '';
  /** Errores de una acción (comprar/abrir): van en un aviso, sin sustituir la vista. */
  let actionError = '';
  let bought = '';
  /** Compra pendiente de confirmar. */
  let pendingBuy: { type: ChestType; method: 'coins' | 'gems'; price: number } | null = null;

  const PRICES = (balance as any).chests as Record<string, { prices?: { coins?: number; gems?: number } }>;
  const priceOf = (type: string, method: 'coins' | 'gems'): number | null => PRICES?.[type]?.prices?.[method] ?? null;

  const TIER_LABEL: Record<string, string> = { common: 'Común', uncommon: 'Poco común', rare: 'Raro', epic: 'Épico', legendary: 'Legendario' };
  const tierLabel = (t: string) => TIER_LABEL[t] ?? t;
  const SOURCE_LABEL: Record<string, string> = {
    daily_missions: 'Misiones diarias', mission: 'Misión', season_pass: 'Pase de temporada', season: 'Temporada',
    purchase: 'Comprado', raid: 'Raid', tournament: 'Torneo', achievement: 'Logro', gift: 'Regalo', login: 'Regalo diario',
  };
  const sourceLabel = (s: string) => SOURCE_LABEL[s] ?? 'Recompensa';

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
    uncommon: 'var(--color-soft-mist)',
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
      error = friendlyError(e, 'No se pudieron cargar los cofres.');
    } finally {
      loading = false;
    }
  }

  async function open(chest: Chest) {
    busyId = chest.id;
    actionError = '';
    bought = '';
    try {
      lastOpen = await api.openChest(chest.id);
      const opened = lastOpen;
      await load();
      lastOpen = opened;
      dispatch('refreshUser');
    } catch (e: any) {
      actionError = friendlyError(e, 'No se pudo abrir el cofre.');
    } finally {
      busyId = '';
    }
  }

  async function buy(type: ChestType, method: 'coins' | 'gems') {
    buying = `${type}:${method}`;
    actionError = '';
    bought = '';
    try {
      await api.purchaseChest(type, method);
      await load();
      bought = `Cofre de ${label(type).toLowerCase()} comprado. Lo tienes arriba, en «Mis cofres».`;
      dispatch('refreshUser');
    } catch (e: any) {
      actionError = friendlyError(e, 'No se pudo comprar el cofre.');
    } finally {
      pendingBuy = null;
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

      {#if actionError}<Notice tone="error" dismissible on:dismiss={() => (actionError = '')}>{actionError}</Notice>{/if}
      {#if bought}<Notice tone="ok">{bought}</Notice>{/if}

      {#if lastOpen}
        <Card variant="pop" title="¡Cofre {label(lastOpen.chest.type)} abierto!" icon="party">
          <div class="drops">
            {#each lastOpen.drops as d (d.itemId + d.tier)}
              <Badge color={TIER_COLOR[d.tier]} title={tierLabel(d.tier)}>
                {d.name} ×{d.qty} · {tierLabel(d.tier)}{#if d.isNew}&nbsp;· Nuevo{/if}
              </Badge>
            {:else}
              <span class="muted">Este cofre venía vacío.</span>
            {/each}
          </div>
          <p class="ui-card__hint">
            Premio asegurado: llevas {lastOpen.pityProgress.count} de {lastOpen.pityProgress.threshold} cofres para un objeto {tierLabel(lastOpen.pityProgress.minTier).toLowerCase()} o mejor garantizado.
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
              sub={busyId === c.id ? 'Abriendo…' : sourceLabel(c.source)}
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
            {#each ['coins', 'gems'] as const as method}
              {@const price = priceOf(type, method)}
              {@const have = method === 'coins' ? (me?.coins ?? 0) : (me?.gems ?? 0)}
              {#if price !== null}
                <Button
                  size="sm"
                  block
                  icon={method === 'coins' ? 'coin' : 'gem'}
                  loading={buying === type + ':' + method}
                  disabled={busyId !== '' || buying !== '' || have < price}
                  label="Comprar cofre de {label(type).toLowerCase()} por {price} {method === 'coins' ? 'monedas' : 'gemas'}"
                  title={have < price ? `Te faltan ${price - have} ${method === 'coins' ? 'monedas' : 'gemas'}` : undefined}
                  on:click={() => (method === 'gems' ? (pendingBuy = { type, method, price }) : buy(type, method))}
                >{price}</Button>
              {/if}
            {/each}
          </Card>
        {/each}
      </div>

      <SectionHeader title="Historial" icon="log" />
      <div class="ui-list ui-list--scroll">
        {#each history?.openings ?? [] as h (h.openedAt)}
          <ListRow icon="gift" iconTint={CHEST_COLOR[h.type]} title={label(h.type)} sub={new Date(h.openedAt).toLocaleDateString()}>
            <div class="drops">
              {#each h.drops.slice(0, 3) as d (d.itemId + d.tier)}
                <Badge size="sm" color={TIER_COLOR[d.tier]} title={tierLabel(d.tier)}>{d.name} ×{d.qty}<span class="sr-only"> ({tierLabel(d.tier)})</span></Badge>
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

  {#if pendingBuy}
    <ConfirmDialog
      title="Comprar cofre de {label(pendingBuy.type).toLowerCase()}"
      icon="gift"
      confirmLabel="Comprar"
      cost={pendingBuy.price}
      currency={pendingBuy.method}
      balance={pendingBuy.method === 'coins' ? (me?.coins ?? 0) : (me?.gems ?? 0)}
      loading={buying !== ''}
      on:confirm={() => pendingBuy && buy(pendingBuy.type, pendingBuy.method)}
      on:cancel={() => (pendingBuy = null)}
    >
      <p>El cofre se guarda en «Mis cofres» para que lo abras cuando quieras.</p>
    </ConfirmDialog>
  {/if}
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
