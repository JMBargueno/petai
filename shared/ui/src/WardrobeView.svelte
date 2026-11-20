<script lang="ts">
  /**
   * Armario y tienda de prendas (spec 38, GUIA_ARTISTICA §7.6): comprar con monedas o gemas, ver
   * las de logro y equipar una prenda por ranura. Solo pinta: el contenedor de cada app carga,
   * compra y equipa.
   */
  import { createEventDispatcher } from 'svelte';
  import { accessoryPreview } from '@pockai/scene/sprites/accessories';
  import AsyncState from './AsyncState.svelte';
  import EmptyState from './EmptyState.svelte';
  import Ico from './Ico.svelte';
  import Notice from './Notice.svelte';
  import SectionHeader from './SectionHeader.svelte';

  /** Mascota en la que se equipan las prendas. */
  export let pet: any = null;
  /** Saldo del jugador (`coins`, `gems`). */
  export let user: any = null;
  /** Ranuras del catálogo (`head`, `face`…). */
  export let slots: string[] = [];
  /** Prendas del catálogo, con su `state`: `owned`, `available` o `locked`. */
  export let accessories: any[] = [];
  /** Prenda puesta en cada ranura. */
  export let equipped: Record<string, string | undefined> = {};
  export let loading = false;
  export let error = '';
  /** Prenda que se está comprando o equipando. */
  export let busy = '';

  const dispatch = createEventDispatcher<{ buy: any; toggle: any }>();
  const buy = (a: any) => dispatch('buy', a);
  /** Equipar la prenda en su ranura, o quitarla si ya estaba puesta. */
  const toggle = (a: any) => dispatch('toggle', a);

  const SLOT_LABEL: Record<string, string> = { head: 'Cabeza', face: 'Cara', neck: 'Cuello', back: 'Espalda' };
  const RARITY_LABEL: Record<string, string> = { normal: 'Normal', rare: 'Raro', super_rare: 'Super-raro', legendary: 'Legendario', mythic: 'Mítico' };

  const canAfford = (a: any) =>
    a.unlock.type === 'coins' ? (user?.coins ?? 0) >= (a.unlock.price ?? 0) : a.unlock.type === 'gems' ? (user?.gems ?? 0) >= (a.unlock.price ?? 0) : false;
</script>


<AsyncState loading={loading && accessories.length === 0} error={accessories.length ? '' : error} rows={4} height={56} />

{#if accessories.length}
  {#if error}<Notice tone="error">{error}</Notice>{/if}
  {#if !pet}<Notice tone="info">Necesitas una mascota para equipar prendas.</Notice>{/if}

  {#each slots as slot (slot)}
    {@const items = accessories.filter((a) => a.slot === slot)}
    <SectionHeader title={SLOT_LABEL[slot] ?? slot} icon="star" count={items.filter((a) => a.state === 'owned').length + ' de ' + items.length} />
    <div class="list">
      {#each items as a (a.id)}
        {@const worn = equipped[slot] === a.id}
        {@const art = accessoryPreview(a.id)}
        <div class="row" class:worn class:locked={a.state === 'locked'}>
          <span class="thumb">
            {#if art}
              <span class="art" style="width:{art.w}px;height:{art.h}px;background-image:url({art.url});background-size:{art.w * art.frames}px {art.h}px"></span>
            {:else}<Ico n="star" />{/if}
          </span>
          <div class="info">
            <span class="name">{a.name}</span>
            <small>{RARITY_LABEL[a.rarity] ?? a.rarity} · {a.description}</small>
            {#if a.state === 'locked'}
              <small class="req"><Ico n="lock" /> Logro: {a.unlock.achievementName ?? a.unlock.achievementId}</small>
            {/if}
          </div>
          {#if a.state === 'owned'}
            <button class="btn btn--sm" class:btn--primary={!worn} disabled={!pet || busy === a.id} on:click={() => toggle(a)}>
              {busy === a.id ? '…' : worn ? 'Quitar' : 'Equipar'}
            </button>
          {:else if a.state === 'available'}
            <span class="price" class:short={!canAfford(a)}>{a.unlock.price} <Ico n={a.unlock.type === 'coins' ? 'coin' : 'gem'} /></span>
            <button class="btn btn--sm btn--primary" disabled={!canAfford(a) || busy === a.id} on:click={() => buy(a)}>
              {busy === a.id ? '…' : 'Comprar'}
            </button>
          {:else}
            <span class="chip"><Ico n="trophy" /> Logro</span>
          {/if}
        </div>
      {:else}
        <EmptyState compact icon="shop" text="Aún no hay prendas para esta ranura." />
      {/each}
    </div>
  {/each}
{/if}

<style>
  .list { display: flex; flex-direction: column; gap: 6px; margin-bottom: var(--space-3); }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: var(--radius-2xl);
    background: var(--surface);
    border: 1px solid var(--line-soft);
  }
  .row.worn { border-color: var(--line); box-shadow: var(--shadow-pop); }
  .thumb {
    flex: none;
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: var(--surface-2);
    overflow: hidden;
  }
  /* Pixel art (GUIA_ARTISTICA §7.5): la prenda se enseña sin suavizado. */
  .art { display: block; background-repeat: no-repeat; image-rendering: pixelated; }
  .locked .art { filter: grayscale(1); }
  .info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  .name { font-size: 13px; font-weight: 700; color: var(--ink); }
  .info small { font-size: 10.5px; color: var(--ink-muted); }
  .req { display: inline-flex; align-items: center; gap: 4px; }
  .price { font-size: 12px; font-weight: 800; white-space: nowrap; color: var(--ink); }
  .price.short { color: var(--danger-ink); }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 10px;
    border-radius: var(--radius-pills);
    border: var(--outline);
    background: var(--color-mint-pop);
    color: var(--on-color);
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
  }
</style>
