<script lang="ts">
  /**
   * Control segmentado / pestañas. `variant="seg"` reparte el ancho (sub-navegación interna);
   * `variant="pills"` son pastillas en una sola fila desplazable (sub-pestañas del panel, salas,
   * filtros): los bordes se difuminan cuando hay más a ese lado y la activa se mantiene a la vista.
   * Admite `bind:value` y emite `change`.
   */
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import Ico from './Ico.svelte';
  import { getPlatform } from './platform';

  type Option = { value: string; label: string; icon?: string; badge?: number | string };
  export let options: Option[] = [];
  export let value: string;
  export let variant: 'seg' | 'pills' = 'seg';
  export let label = 'Secciones';
  let klass = '';
  export { klass as class };

  const checkMark = getPlatform() === 'android';

  const dispatch = createEventDispatcher<{ change: string }>();
  let host: HTMLDivElement;
  let more: 'none' | 'start' | 'end' | 'both' = 'none';

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
    host.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  }

  function updateMore() {
    if (!host || variant !== 'pills') return;
    const start = host.scrollLeft > 2;
    const end = host.scrollLeft + host.clientWidth < host.scrollWidth - 2;
    more = start && end ? 'both' : start ? 'start' : end ? 'end' : 'none';
  }

  /** La rueda vertical desplaza la fila (no hay barra de scroll visible). */
  function onWheel(e: WheelEvent) {
    if (variant !== 'pills' || host.scrollWidth <= host.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    host.scrollLeft += e.deltaY;
  }

  async function revealActive() {
    await tick();
    if (!host || variant !== 'pills') return;
    const active = host.querySelector<HTMLElement>('[aria-selected="true"]');
    if (active) {
      // Centrar a mano: scrollIntoView también movería el scroll vertical del panel.
      const target = active.offsetLeft - (host.clientWidth - active.offsetWidth) / 2;
      host.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
    }
    updateMore();
  }

  $: value, options, revealActive();

  onMount(() => {
    updateMore();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateMore) : null;
    ro?.observe(host);
    return () => ro?.disconnect();
  });
</script>

<div
  bind:this={host}
  class="{variant === 'seg' ? 'ui-seg' : 'ui-pills'} {klass}"
  data-more={variant === 'pills' ? more : undefined}
  role="tablist"
  tabindex="-1"
  aria-label={label}
  on:keydown={onKeydown}
  on:scroll={updateMore}
  on:wheel|nonpassive={onWheel}
>
  {#each options as o (o.value)}
    <button type="button" role="tab" aria-selected={value === o.value} tabindex={value === o.value ? 0 : -1} class:active={value === o.value} on:click={() => pick(o.value)}>
      <!-- Material 3: el segmento o chip elegido lleva un check delante en lugar de su icono. -->
      {#if checkMark && value === o.value}<Ico n="check" size={14} />{:else if o.icon}<Ico n={o.icon} size={16} />{/if}{o.label}
      {#if o.badge}<span class="chip ui-chip ui-count">{o.badge}</span>{/if}
    </button>
  {/each}
</div>
