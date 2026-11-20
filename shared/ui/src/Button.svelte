<script lang="ts">
  /** Botón del sistema (guía §9). Envuelve las clases .btn de base.css/kit.css. */
  import Ico from './Ico.svelte';

  export let variant: 'default' | 'primary' | 'ink' | 'ghost' | 'danger' | 'success' = 'default';
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let block = false;
  /** Nombre de icono de Ico.svelte, delante del texto. */
  export let icon: string | null = null;
  /** Solo icono (cuadrado): necesita `label` para lectores de pantalla. */
  export let iconOnly = false;
  export let label: string | undefined = undefined;
  export let loading = false;
  export let disabled = false;
  export let type: 'button' | 'submit' = 'button';
  export let title: string | undefined = undefined;
  let klass = '';
  export { klass as class };

  $: iconSize = size === 'sm' ? 14 : 16;
</script>

<button
  {type}
  class="btn {klass}"
  class:btn--primary={variant === 'primary'}
  class:btn--ink={variant === 'ink'}
  class:btn--ghost={variant === 'ghost'}
  class:btn--danger={variant === 'danger'}
  class:btn--success={variant === 'success'}
  class:btn--sm={size === 'sm'}
  class:btn--lg={size === 'lg'}
  class:btn--block={block}
  class:btn--icon={iconOnly}
  disabled={disabled || loading}
  aria-busy={loading || undefined}
  aria-label={label}
  title={title ?? (iconOnly ? label : undefined)}
  on:click
>
  {#if loading}
    <span class="ui-spinner" aria-hidden="true"></span>
  {:else if icon}
    <Ico n={icon} size={iconSize} />
  {/if}
  <slot />
</button>
