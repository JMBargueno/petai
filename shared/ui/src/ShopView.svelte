<script lang="ts">
  /** Tienda › Tienda: catálogo de objetos que se compran con monedas. */
  import { createEventDispatcher } from 'svelte';
  import ItemIcon from './ItemIcon.svelte';
  import Button from './Button.svelte';
  import CurrencyPill from './CurrencyPill.svelte';
  import EmptyState from './EmptyState.svelte';
  import ListRow from './ListRow.svelte';
  import SectionHeader from './SectionHeader.svelte';

  export let shopItems: any[] = [];
  /** Inventario actual, para decir cuántos tienes ya de cada objeto. */
  export let inventory: any[] = [];
  export let coins = 0;
  /** Objeto cuya compra está en curso (bloquea todos los botones para evitar dobles compras). */
  export let busyItem: string | null = null;

  const dispatch = createEventDispatcher<{ buy: string }>();

  const owned = (id: string, inv: any[]) => inv.find((i) => i.itemId === id)?.qty ?? 0;
</script>

<div class="ui-stack">
  <SectionHeader title="Objetos" icon="shop" count={shopItems.length} />
  <div class="ui-list">
    {#each shopItems as item (item.id)}
      {@const have = owned(item.id, inventory)}
      {@const short = coins < item.priceCoins}
      <ListRow title={item.name} sub="{item.description}{have ? ` · Tienes ${have}` : ''}" wrap>
        <ItemIcon slot="lead" id={item.id} />
        <svelte:fragment slot="end">
          <CurrencyPill kind="coins" amount={item.priceCoins} plain />
          <Button
            size="sm"
            loading={busyItem === item.id}
            disabled={short || busyItem !== null}
            label="Comprar {item.name} por {item.priceCoins} monedas"
            title={short ? `Te faltan ${item.priceCoins - coins} monedas` : undefined}
            on:click={() => dispatch('buy', item.id)}
          >
            {short ? 'No alcanza' : 'Comprar'}
          </Button>
        </svelte:fragment>
      </ListRow>
    {:else}
      <EmptyState icon="shop" text="La tienda está vacía ahora mismo." />
    {/each}
  </div>
</div>
