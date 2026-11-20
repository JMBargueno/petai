<script lang="ts">
  /** Insignia de estado. `color` (CSS) tiñe la insignia con cualquier token (rareza, elemento…). */
  import Ico from './Ico.svelte';

  export let tone: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'tint' = 'neutral';
  export let color: string | null = null;
  export let solid = false;
  export let icon: string | null = null;
  export let size: 'sm' | 'md' = 'md';
  export let title: string | undefined = undefined;
</script>

<span
  class="ui-badge ui-badge--{color ? 'custom' : tone}"
  class:ui-badge--solid={solid}
  class:ui-badge--sm={size === 'sm'}
  style={color ? `--badge-c: ${color}` : undefined}
  {title}
>
  {#if icon}<Ico n={icon} size={size === 'sm' ? 11 : 12} />{/if}<slot />
</span>
