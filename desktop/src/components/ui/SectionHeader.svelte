<script lang="ts">
  /** Cabecera de sección: título en versalitas + contador opcional + acciones (slot `end`) o botón de recargar. */
  import Ico from '../Ico.svelte';

  export let title: string;
  export let icon: string | null = null;
  export let count: number | string | null = null;
  /** Si se pasa, muestra un botón de recargar que gira mientras `loading`. */
  export let onRefresh: (() => void) | null = null;
  export let loading = false;
</script>

<div class="ui-head">
  <span class="label-caps">{#if icon}<Ico n={icon} size={13} />{/if}{title}</span>
  {#if count !== null && count !== undefined}<span class="chip ui-count">{count}</span>{/if}
  {#if $$slots.end || onRefresh}
    <div class="ui-head__end">
      <slot name="end" />
      {#if onRefresh}
        <button
          class="btn btn--ghost btn--icon ui-ibtn ui-refresh"
          class:spinning={loading}
          aria-label="Actualizar"
          title="Actualizar"
          disabled={loading}
          on:click={onRefresh}
        >
          <Ico n="refresh" size={15} />
        </button>
      {/if}
    </div>
  {/if}
</div>
