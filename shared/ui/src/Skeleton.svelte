<script lang="ts">
  /** Esqueleto de carga: `rows` bloques de `height` px. */
  export let rows = 3;
  export let height = 52;
</script>

<div class="ui-loading" aria-busy="true" aria-label="Cargando">
  {#each Array(rows) as _, i (i)}
    <div class="ui-skel" style="height: {height}px"></div>
  {/each}
</div>
