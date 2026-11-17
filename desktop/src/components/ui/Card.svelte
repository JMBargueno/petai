<script lang="ts">
  /**
   * Tarjeta base del panel. `pop` = sombra sticker, `flat` = borde suave sin sombra,
   * `hero` = degradado con el color de la sección (--view-tint).
   */
  import Ico from '../Ico.svelte';

  export let variant: 'default' | 'pop' | 'flat' | 'hero' = 'default';
  export let size: 'sm' | 'md' = 'md';
  /** Título opcional con icono (Ico.svelte). */
  export let title = '';
  export let icon: string | null = null;
  export let hint = '';
  let klass = '';
  export { klass as class };
</script>

<section
  class="ui-card {klass}"
  class:ui-card--pop={variant === 'pop'}
  class:ui-card--flat={variant === 'flat'}
  class:ui-card--hero={variant === 'hero'}
  class:ui-card--sm={size === 'sm'}
>
  {#if title}
    <h3 class="ui-card__title">{#if icon}<Ico n={icon} />{/if}{title}<slot name="title-end" /></h3>
  {/if}
  {#if hint}<p class="ui-card__hint">{hint}</p>{/if}
  <slot />
</section>
