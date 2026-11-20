<script lang="ts">
  /**
   * Cofres: los que tienes por abrir, lo último que salió, la compra (con confirmación si es con
   * gemas) y el historial. Solo pinta: el contenedor de cada app carga, abre y compra.
   */
  import { createEventDispatcher } from 'svelte';
  import { chestLabel as label, chestPrice as priceOf, type ChestPayment } from './chests';
  import { itemIcon } from './items';
  import AsyncState from './AsyncState.svelte';
  import Badge from './Badge.svelte';
  import Button from './Button.svelte';
  import Card from './Card.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import CurrencyPill from './CurrencyPill.svelte';
  import EmptyState from './EmptyState.svelte';
  import Ico from './Ico.svelte';
  import ItemIcon from './ItemIcon.svelte';
  import ListRow from './ListRow.svelte';
  import Notice from './Notice.svelte';
  import SectionHeader from './SectionHeader.svelte';
  import TileButton from './TileButton.svelte';

  /** `GET /chests`: `{ chests }`. */
  export let chests: any = null;
  /** `GET /chests/history`: `{ openings }`. */
  export let history: any = null;
  /** Respuesta del último cofre abierto (`chest`, `drops`, `pityProgress`), o `null`. */
  export let lastOpen: any = null;
  /** Saldo del jugador. */
  export let coins: number | null = null;
  export let gems: number | null = null;
  export let loading = false;
  /** Error de carga: sustituye la vista. */
  export let error = '';
  /** Cofre que se está abriendo. */
  export let busyId = '';
  /** Compra en curso (`<tipo>:<moneda>`). Al terminar se cierra la confirmación. */
  export let buying = '';
  /** Error de una acción (abrir, comprar): va en un aviso, sin sustituir la vista. */
  export let actionError = '';
  /** Aviso tras comprar. */
  export let bought = '';

  const dispatch = createEventDispatcher<{
    refresh: void;
    open: any;
    buy: { type: string; method: ChestPayment };
    dismissError: void;
  }>();
  const load = () => dispatch('refresh');
  const open = (chest: any) => dispatch('open', chest);
  const buy = (type: string, method: ChestPayment) => dispatch('buy', { type, method });

  /** Compra pendiente de confirmar. */
  let pendingBuy: { type: string; method: ChestPayment; price: number } | null = null;
  let wasBuying = '';
  $: {
    if (wasBuying && !buying) pendingBuy = null;
    wasBuying = buying;
  }

  const TIER_LABEL: Record<string, string> = { common: 'Común', uncommon: 'Poco común', rare: 'Raro', epic: 'Épico', legendary: 'Legendario' };
  const tierLabel = (t: string) => TIER_LABEL[t] ?? t;
  const SOURCE_LABEL: Record<string, string> = {
    daily_missions: 'Misiones diarias', mission: 'Misión', season_pass: 'Pase de temporada', season: 'Temporada',
    purchase: 'Comprado', raid: 'Raid', tournament: 'Torneo', achievement: 'Logro', gift: 'Regalo', login: 'Regalo diario',
    voucher: 'Código canjeado', admin_grant: 'Regalo del equipo',
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
  const TIER_COLOR: Record<string, string> = {
    common: 'var(--rarity-common)',
    uncommon: 'var(--color-soft-mist)',
    rare: 'var(--rarity-rare)',
    epic: 'var(--rarity-super-rare)',
    legendary: 'var(--rarity-legendary)',
  };
  const PURCHASABLE = ['bronze', 'silver', 'gold'];
</script>


<div class="ui-stack">
  <AsyncState {loading} {error} onRetry={load} rows={4}>
    {#if chests}
      <div class="balance">
        <span class="label-caps muted">Saldo</span>
        <CurrencyPill kind="coins" amount={coins ?? '—'} />
        <CurrencyPill kind="gems" amount={gems ?? '—'} />
      </div>

      {#if actionError}<Notice tone="error" dismissible on:dismiss={() => dispatch('dismissError')}>{actionError}</Notice>{/if}
      {#if bought}<Notice tone="ok">{bought}</Notice>{/if}

      {#if lastOpen}
        <Card variant="pop" title="¡Cofre {label(lastOpen.chest.type)} abierto!" icon="party">
          <div class="drops">
            {#each lastOpen.drops as d, i (i)}
              <span class="drop">
                {#if itemIcon(d.itemId)}<ItemIcon id={d.itemId} scale={2} />{/if}
                <Badge color={TIER_COLOR[d.tier]} title={tierLabel(d.tier)}>
                  {d.name} ×{d.qty} · {tierLabel(d.tier)}{#if d.isNew}&nbsp;· Nuevo{/if}
                </Badge>
              </span>
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
              {@const have = method === 'coins' ? (coins ?? 0) : (gems ?? 0)}
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
        {#each history?.openings ?? [] as h (h.chestId)}
          <ListRow icon="gift" iconTint={CHEST_COLOR[h.type]} title={label(h.type)} sub={new Date(h.openedAt).toLocaleDateString()}>
            <div class="drops">
              {#each h.drops.slice(0, 3) as d, i (i)}
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
      balance={pendingBuy.method === 'coins' ? (coins ?? 0) : (gems ?? 0)}
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
  /* Un premio recién salido del cofre: su icono (si lo tiene) sobre su etiqueta. */
  .drop {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-1);
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
