<script lang="ts">
  /**
   * Control segmentado / pestañas. `variant="seg"` reparte el ancho (sub-navegación interna);
   * `variant="pills"` son pastillas desplazables (sub-pestañas del panel, salas, filtros).
   * Admite `bind:value` y emite `change`.
   */
  import { createEventDispatcher } from 'svelte';
  import Ico from '../Ico.svelte';

  type Option = { value: string; label: string; icon?: string; badge?: number | string };
  export let options: Option[] = [];
  export let value: string;
  export let variant: 'seg' | 'pills' = 'seg';
  export let label = 'Secciones';
  let klass = '';
  export { klass as class };

  const dispatch = createEventDispatcher<{ change: string }>();
  function pick(v: string) {
    value = v;
    dispatch('change', v);
  }
</script>

<div class="{variant === 'seg' ? 'ui-seg' : 'ui-pills'} {klass}" role="tablist" aria-label={label}>
  {#each options as o (o.value)}
    <button type="button" role="tab" aria-selected={value === o.value} class:active={value === o.value} on:click={() => pick(o.value)}>
      {#if o.icon}<Ico n={o.icon} size={13} />{/if}{o.label}
      {#if o.badge}<span class="chip ui-chip ui-count">{o.badge}</span>{/if}
    </button>
  {/each}
</div>
