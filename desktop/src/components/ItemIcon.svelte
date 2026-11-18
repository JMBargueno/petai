<script lang="ts">
  /**
   * Icono de un objeto consumible en pixel art (GUIA_ARTISTICA §7.7). Es decorativo: el nombre del
   * objeto va siempre escrito al lado. Si el objeto no tiene arte, pinta el icono genérico `fallback`.
   */
  import Ico from './Ico.svelte';
  import { ITEM_ICON_SIZE, itemIcon } from '../lib/items';

  export let id: string | null | undefined;
  /** Escala entera sobre los 32 px nativos: 1 en listas y chips, 2 en tarjetas. */
  export let scale: 1 | 2 | 4 = 1;
  /** Icono de interfaz si el objeto no tiene arte. */
  export let fallback = 'food';

  $: url = itemIcon(id);
  $: side = ITEM_ICON_SIZE * scale;
</script>

{#if url}
  <img class="item-icon" src={url} width={side} height={side} alt="" aria-hidden="true" draggable="false" />
{:else}
  <span class="item-icon item-icon--fallback" style="width: {side}px; height: {side}px" aria-hidden="true">
    <Ico n={fallback} size={side / 2} />
  </span>
{/if}

<style>
  .item-icon {
    flex-shrink: 0;
    image-rendering: pixelated;
  }
  .item-icon--fallback {
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--surface-2);
    color: var(--ink);
  }
</style>
