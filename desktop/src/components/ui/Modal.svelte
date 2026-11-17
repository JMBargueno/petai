<script lang="ts">
  /** Diálogo modal con fondo. Cierra con Esc, clic fuera o la X (emite `close`). Slot `footer` para acciones. */
  import { createEventDispatcher } from 'svelte';
  import Ico from '../Ico.svelte';

  export let open = true;
  export let title = '';
  export let icon: string | null = null;
  export let closable = true;

  const dispatch = createEventDispatcher<{ close: void }>();
  function close() {
    if (closable) dispatch('close');
  }
</script>

<svelte:window on:keydown={(e) => open && e.key === 'Escape' && close()} />

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="ui-modal-backdrop" on:click|self={close}>
    <div class="ui-modal" role="dialog" aria-modal="true" aria-label={title || undefined}>
      {#if title || closable}
        <div class="ui-modal__head">
          {#if icon}<Ico n={icon} size={20} />{/if}
          <h2 class="ui-modal__title">{title}</h2>
          {#if closable}
            <button class="btn btn--ghost btn--icon ui-ibtn" aria-label="Cerrar" on:click={close}><Ico n="x" size={16} /></button>
          {/if}
        </div>
      {/if}
      <slot />
      {#if $$slots.footer}<div class="ui-modal__foot"><slot name="footer" /></div>{/if}
    </div>
  </div>
{/if}
