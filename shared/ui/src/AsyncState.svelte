<script lang="ts">
  /**
   * Cascada estándar de una vista que carga datos: esqueleto → error (con reintentar) → contenido.
   * Uso: <AsyncState {loading} {error} onRetry={load}> …contenido… </AsyncState>
   *
   * El esqueleto y el error a pantalla completa solo salen en la PRIMERA carga. Una vez hay
   * contenido, los refrescos lo dejan a la vista (atenuado) y los errores se muestran encima
   * como aviso, para que una acción fallida no borre lo que el usuario estaba viendo.
   */
  import Skeleton from './Skeleton.svelte';
  import Notice from './Notice.svelte';

  export let loading = false;
  export let error = '';
  export let onRetry: (() => void) | null = null;
  export let rows = 3;
  export let height = 52;

  let loaded = false;
  $: if (!loading && !error) loaded = true;
</script>

{#if loading && !loaded}
  <Skeleton {rows} {height} />
{:else if error && !loaded}
  <Notice tone="error">
    {error}
    <svelte:fragment slot="end">
      {#if onRetry}<button class="btn btn--ghost btn--sm" on:click={onRetry}>Reintentar</button>{/if}
    </svelte:fragment>
  </Notice>
{:else}
  {#if error}
    <Notice tone="error">{error}</Notice>
  {/if}
  <div class="ui-stack ui-async" class:ui-async--busy={loading} aria-busy={loading || undefined}>
    <slot />
  </div>
{/if}
