<script lang="ts">
  /** Baldosa pulsable con icono grande + etiqueta (elementos, cuidados, desbloqueos). Agrupar en .ui-tiles. */
  import Ico from './Ico.svelte';

  export let icon: string;
  export let label: string;
  export let sub = '';
  export let selected = false;
  export let disabled = false;
  /** Color del icono / selección (CSS). */
  export let color: string | null = null;
  export let title: string | undefined = undefined;
</script>

<button
  type="button"
  class="ui-tile"
  class:ui-tile--selected={selected}
  style={color ? `--tile-c: ${color}` : undefined}
  aria-pressed={selected}
  {disabled}
  {title}
  on:click
>
  <span class="ui-tile__icon" aria-hidden="true"><Ico n={icon} size={18} /></span>
  <span>{label}</span>
  {#if sub}<span class="ui-tile__sub">{sub}</span>{/if}
</button>
