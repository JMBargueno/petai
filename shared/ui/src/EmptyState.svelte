<script lang="ts">
  /** Estado vacío: icono en círculo + título + texto + acción opcional (slot). `compact` para listas. */
  import Ico from './Ico.svelte';

  export let icon = 'paw';
  export let title = '';
  export let text = '';
  export let compact = false;
</script>

<div class="ui-empty" class:ui-empty--compact={compact}>
  <span class="ui-empty__icon" aria-hidden="true"><Ico n={icon} size={compact ? 14 : 22} /></span>
  {#if title || text}
    <div>
      {#if title}<strong>{title}</strong>{/if}
      {#if text}<p>{text}</p>{/if}
    </div>
  {/if}
  <slot />
</div>
