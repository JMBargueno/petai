<script lang="ts">
  /**
   * Mascota › Mochila (spec 41): todos los objetos que se usan sobre la mascota, agrupados por tipo,
   * con un botón «Usar». Incluye los que no se compran (Enhebrador) y los que solo da el admin.
   * Las prendas no salen aquí: se ponen en el Armario.
   */
  import { createEventDispatcher } from 'svelte';
  import ItemIcon from './ItemIcon.svelte';
  import Badge from './Badge.svelte';
  import Button from './Button.svelte';
  import EmptyState from './EmptyState.svelte';
  import ListRow from './ListRow.svelte';
  import SectionHeader from './SectionHeader.svelte';

  export let pet: any = null;
  export let inventory: any[] = [];
  /** Acción en curso del panel (`use:<itemId>` cuando se está usando un objeto). */
  export let busy: string | null = null;

  const dispatch = createEventDispatcher<{ use: string; go: { dest: string; sub: string } }>();

  const GROUPS: { kind: string; title: string; icon: string }[] = [
    { kind: 'level_up', title: 'Especiales', icon: 'xp' },
    { kind: 'medicine', title: 'Medicinas', icon: 'heart' },
    { kind: 'evolution', title: 'Evolución', icon: 'party' },
    { kind: 'food', title: 'Comida', icon: 'food' },
  ];
  const AVAILABILITY: Record<string, string> = { drop: 'Solo drop', hidden: 'Exclusivo' };
  const MAX_LEVEL = 100;

  /** Objeto que espera la segunda pulsación (los que no tienen vuelta atrás, como el Enhebrador). */
  let confirming: string | null = null;

  $: groups = GROUPS.map((g) => ({ ...g, items: inventory.filter((i) => i.qty > 0 && i.item?.kind === g.kind) })).filter((g) => g.items.length);

  function blockedReason(item: any): string | null {
    if (!pet) return 'No tienes una mascota activa';
    if (item.kind === 'level_up' && pet.level >= MAX_LEVEL) return 'Ya está en el nivel máximo';
    if (item.kind === 'food' && pet.sleeping) return 'Está dormida';
    if (item.kind === 'evolution' && (pet.stage === 'final' || pet.stage !== 'adult')) return 'Solo un adulto de nivel 50 puede evolucionar';
    return null;
  }

  function onUse(row: any) {
    const needsConfirm = row.item.kind === 'level_up' || row.item.kind === 'evolution';
    if (needsConfirm && confirming !== row.itemId) {
      confirming = row.itemId;
      return;
    }
    confirming = null;
    dispatch('use', row.itemId);
  }
</script>

<div class="ui-stack">
  {#each groups as g (g.kind)}
    <SectionHeader title={g.title} icon={g.icon} count={g.items.reduce((n, i) => n + i.qty, 0)} />
    <div class="ui-list">
      {#each g.items as row (row.itemId)}
        {@const reason = blockedReason(row.item)}
        {@const asking = confirming === row.itemId}
        <ListRow title={row.item.name} sub={asking && row.item.kind === 'level_up' ? `${pet?.nickname || 'Tu Pockai'} pasará al nivel ${(pet?.level ?? 0) + 1}. ¿Seguro?` : row.item.description} wrap>
          <ItemIcon slot="lead" id={row.itemId} />
          <svelte:fragment slot="end">
            {#if AVAILABILITY[row.item.availability]}
              <Badge>{AVAILABILITY[row.item.availability]}</Badge>
            {/if}
            <span class="qty" aria-label="Tienes {row.qty}">×{row.qty}</span>
            <Button
              size="sm"
              variant={asking ? 'primary' : undefined}
              loading={busy === `use:${row.itemId}`}
              disabled={!!busy || !!reason}
              title={reason ?? undefined}
              label="Usar {row.item.name}"
              on:click={() => onUse(row)}
            >
              {asking ? 'Confirmar' : 'Usar'}
            </Button>
          </svelte:fragment>
        </ListRow>
      {/each}
    </div>
  {:else}
    <EmptyState icon="gift" text="Tu mochila está vacía. Los objetos que compres o encuentres aparecerán aquí.">
      <Button size="sm" icon="shop" on:click={() => dispatch('go', { dest: 'shop', sub: 'store' })}>Ir a la tienda</Button>
    </EmptyState>
  {/each}
</div>

<style>
  .qty {
    font-variant-numeric: tabular-nums;
    opacity: 0.8;
    min-inline-size: 2.5ch;
    text-align: end;
  }
</style>
