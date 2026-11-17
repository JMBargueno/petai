<script lang="ts">
  /** Barra de progreso. `color` admite cualquier valor CSS (token, degradado…). `label`/`detail` pintan la fila superior. */
  export let value = 0;
  export let max = 100;
  export let color: string | null = null;
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let label = '';
  export let detail = '';

  $: pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
</script>

{#if label || detail}
  <div class="ui-progress-label"><span>{label}</span><span>{detail}</span></div>
{/if}
<div
  class="ui-progress"
  class:ui-progress--sm={size === 'sm'}
  class:ui-progress--lg={size === 'lg'}
  style={color ? `--progress-c: ${color}` : undefined}
  role="progressbar"
  aria-valuemin={0}
  aria-valuemax={max}
  aria-valuenow={value}
  aria-label={label || undefined}
>
  <i style="width: {pct}%"></i>
</div>
