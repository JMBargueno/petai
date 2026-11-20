<script lang="ts">
  /** Aviso en línea (error / ok / warning / info). Con `dismissible` emite `dismiss`. */
  import { createEventDispatcher } from 'svelte';
  import Ico from './Ico.svelte';

  export let tone: 'error' | 'ok' | 'warning' | 'info' = 'info';
  export let icon: string | null = null;
  export let dismissible = false;

  const dispatch = createEventDispatcher<{ dismiss: void }>();
  const DEFAULT_ICON = { error: 'alert', ok: 'ok', warning: 'warn', info: 'info' } as const;
  $: ico = icon ?? DEFAULT_ICON[tone];
</script>

<div class="ui-notice ui-notice--{tone}" role={tone === 'error' ? 'alert' : 'status'}>
  <Ico n={ico} size={15} />
  <div class="ui-notice__body"><slot /></div>
  {#if dismissible}
    <div class="ui-notice__end">
      <button class="btn btn--ghost btn--icon ui-ibtn" aria-label="Cerrar aviso" on:click={() => dispatch('dismiss')}>
        <Ico n="x" size={14} />
      </button>
    </div>
  {:else if $$slots.end}
    <div class="ui-notice__end"><slot name="end" /></div>
  {/if}
</div>
