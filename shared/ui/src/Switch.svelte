<script lang="ts">
  /** Interruptor on/off con etiqueta. Emite `change` con el nuevo valor (no muta `checked` por sí solo si se usa como controlado). */
  import { createEventDispatcher } from 'svelte';
  import Ico from './Ico.svelte';

  export let checked = false;
  export let label = '';
  export let sub = '';
  export let icon: string | null = null;
  export let disabled = false;

  const dispatch = createEventDispatcher<{ change: boolean }>();
  function toggle() {
    if (disabled) return;
    checked = !checked;
    dispatch('change', checked);
  }
</script>

<button type="button" class="ui-switch" role="switch" aria-checked={checked} {disabled} on:click={toggle}>
  {#if icon}<span class="ui-row__lead ui-switch__icon" aria-hidden="true"><Ico n={icon} size={15} /></span>{/if}
  <span class="ui-switch__text">
    <span class="ui-switch__label">{label}<slot /></span>
    {#if sub}<span class="ui-switch__sub">{sub}</span>{/if}
  </span>
  <span class="ui-switch__track" aria-hidden="true"><i></i></span>
</button>
