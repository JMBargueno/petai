<script lang="ts">
  /** Cifra destacada con etiqueta. Se agrupan dentro de un <div class="ui-stats">. */
  import Ico from './Ico.svelte';

  export let value: string | number;
  export let label: string;
  export let icon: string | null = null;
</script>

<div class="ui-stat">
  <span class="ui-stat__value">{#if icon}<Ico n={icon} size={15} />{/if}{value}</span>
  <span class="ui-stat__label">{label}</span>
</div>
