<script lang="ts">
  /**
   * Cascada estándar de una vista que carga datos: esqueleto → error (con reintentar) → contenido.
   * Uso: <AsyncState {loading} {error} onRetry={load}> …contenido… </AsyncState>
   */
  import Skeleton from './Skeleton.svelte';
  import Notice from './Notice.svelte';

  export let loading = false;
  export let error = '';
  export let onRetry: (() => void) | null = null;
  export let rows = 3;
  export let height = 52;
</script>

{#if loading}
  <Skeleton {rows} {height} />
{:else if error}
  <Notice tone="error">
    {error}
    <svelte:fragment slot="end">
      {#if onRetry}<button class="btn btn--ghost btn--sm" on:click={onRetry}>Reintentar</button>{/if}
    </svelte:fragment>
  </Notice>
{:else}
  <slot />
{/if}
