<script lang="ts">
  /** Tienda › Tienda: catálogo de objetos que se compran con monedas. */
  import { createEventDispatcher } from 'svelte';
  import { Button, CurrencyPill, EmptyState, ListRow, SectionHeader } from '../ui';

  export let shopItems: any[] = [];

  const dispatch = createEventDispatcher<{ buy: string }>();
</script>

<div class="ui-stack">
  <SectionHeader title="Objetos" icon="shop" count={shopItems.length} />
  <div class="ui-list">
    {#each shopItems as item (item.id)}
      <ListRow icon="food" title={item.name} sub={item.description} wrap>
        <svelte:fragment slot="end">
          <CurrencyPill kind="coins" amount={item.priceCoins} plain />
          <Button variant="primary" size="sm" on:click={() => dispatch('buy', item.id)}>Comprar</Button>
        </svelte:fragment>
      </ListRow>
    {:else}
      <EmptyState icon="shop" text="La tienda está vacía ahora mismo." />
    {/each}
  </div>
</div>
