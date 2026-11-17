<script lang="ts">
  /**
   * Fila de lista (historiales, rankings, miembros…). Slots: `lead` (icono/avatar), default (contenido
   * extra bajo el título), `end` (valor/acciones). `icon` pinta un icono en círculo si no hay `lead`.
   */
  import Ico from '../Ico.svelte';

  export let title = '';
  export let sub = '';
  export let icon: string | null = null;
  /** Color del círculo del icono. */
  export let iconTint: string | null = null;
  /** Posición en un ranking (se pinta a la izquierda). */
  export let rank: number | null = null;
  /** Valor destacado a la derecha (si no hay slot `end`). */
  export let value: string | number | null = null;
  export let highlight = false;
  export let done = false;
  export let muted = false;
  export let wrap = false;
  let klass = '';
  export { klass as class };
</script>

<div
  class="ui-row {klass}"
  class:ui-row--highlight={highlight}
  class:ui-row--done={done}
  class:ui-row--muted={muted}
>
  {#if rank !== null}
    <span class="ui-row__rank" class:ui-row__rank--top={rank <= 3}>
      {#if rank === 1}<Ico n="crown" size={15} />{:else}#{rank}{/if}
    </span>
  {/if}
  {#if $$slots.lead}
    <slot name="lead" />
  {:else if icon}
    <span
      class="ui-row__lead"
      style={iconTint ? `background: color-mix(in srgb, ${iconTint} 40%, var(--surface)); color: var(--on-color)` : undefined}
      aria-hidden="true"><Ico n={icon} size={16} /></span
    >
  {/if}
  <div class="ui-row__body">
    {#if title}<span class="ui-row__title">{title}</span>{/if}
    {#if sub}<span class="ui-row__sub" class:ui-row__sub--wrap={wrap}>{sub}</span>{/if}
    <slot />
  </div>
  {#if $$slots.end}
    <div class="ui-row__actions"><slot name="end" /></div>
  {:else if value !== null}
    <span class="ui-row__value">{value}</span>
  {/if}
</div>
