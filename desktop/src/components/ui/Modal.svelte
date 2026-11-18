<script lang="ts">
  /** Diálogo modal con fondo. Cierra con Esc, clic fuera o la X (emite `close`). Slot `footer` para acciones. */
  import { createEventDispatcher } from 'svelte';
  import Ico from '../Ico.svelte';
  import { focusTrap } from '../../lib/ui/focusTrap';

  export let open = true;
  export let title = '';
  /** Nombre accesible cuando no hay `title` visible. */
  export let label = '';
  export let icon: string | null = null;
  export let closable = true;

  const titleId = `ui-modal-${Math.random().toString(36).slice(2, 9)}`;
  const dispatch = createEventDispatcher<{ close: void }>();
  function close() {
    if (closable) dispatch('close');
  }
</script>

<svelte:window on:keydown={(e) => open && e.key === 'Escape' && close()} />

{#if open}
  <div class="ui-modal-backdrop" role="presentation" on:click|self={close}>
    <div
      class="ui-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : label || undefined}
      tabindex="-1"
      use:focusTrap
    >
      {#if title || closable}
        <div class="ui-modal__head">
          {#if icon}<Ico n={icon} size={20} />{/if}
          {#if title}<h2 class="ui-modal__title" id={titleId}>{title}</h2>{:else}<span class="ui-modal__title"></span>{/if}
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
