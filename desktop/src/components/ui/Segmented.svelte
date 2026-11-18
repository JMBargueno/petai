<script lang="ts">
  /**
   * Control segmentado / pestañas. `variant="seg"` reparte el ancho (sub-navegación interna);
   * `variant="pills"` son pastillas desplazables (sub-pestañas del panel, salas, filtros).
   * Admite `bind:value` y emite `change`.
   */
  import { createEventDispatcher } from 'svelte';
  import Ico from '../Ico.svelte';

  type Option = { value: string; label: string; icon?: string; badge?: number | string };
  export let options: Option[] = [];
  export let value: string;
  export let variant: 'seg' | 'pills' = 'seg';
  export let label = 'Secciones';
  let klass = '';
  export { klass as class };

  const dispatch = createEventDispatcher<{ change: string }>();
  function pick(v: string) {
    value = v;
    dispatch('change', v);
  }

  /** Patrón de pestañas: flechas, Inicio y Fin mueven la selección y el foco. */
  function onKeydown(e: KeyboardEvent) {
    const i = options.findIndex((o) => o.value === value);
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + options.length) % options.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    if (next < 0 || !options[next]) return;
    e.preventDefault();
    pick(options[next].value);
    const tabs = (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="tab"]');
    tabs[next]?.focus();
    tabs[next]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
</script>

<div class="{variant === 'seg' ? 'ui-seg' : 'ui-pills'} {klass}" role="tablist" tabindex="-1" aria-label={label} on:keydown={onKeydown}>
  {#each options as o (o.value)}
    <button type="button" role="tab" aria-selected={value === o.value} tabindex={value === o.value ? 0 : -1} class:active={value === o.value} on:click={() => pick(o.value)}>
      {#if o.icon}<Ico n={o.icon} size={13} />{/if}{o.label}
      {#if o.badge}<span class="chip ui-chip ui-count">{o.badge}</span>{/if}
    </button>
  {/each}
</div>
