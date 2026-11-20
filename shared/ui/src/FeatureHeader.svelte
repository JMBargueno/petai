<script lang="ts">
  /** Cabecera de una funcionalidad (juego, raid, temporada…): icono en baldosa + título display + subtítulo. */
  import Ico from './Ico.svelte';

  export let title: string;
  export let sub = '';
  /** Nombre de icono de Ico.svelte. */
  export let icon = 'star';
  /** Color de la baldosa (CSS). Por defecto, el de la sección. */
  export let tint: string | null = null;
</script>

<div class="ui-feature" style={tint ? `--feature-tint: ${tint}` : undefined}>
  <span class="ui-feature__icon" aria-hidden="true"><Ico n={icon} size={22} /></span>
  <div class="ui-feature__body">
    <h3 class="ui-feature__title">{title}</h3>
    {#if sub || $$slots.sub}<p class="ui-feature__sub">{sub}<slot name="sub" /></p>{/if}
  </div>
  {#if $$slots.end}<div class="ui-feature__end"><slot name="end" /></div>{/if}
</div>
