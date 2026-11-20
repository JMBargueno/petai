<script lang="ts">
  /**
   * Control deslizante 0–1 con etiqueta y porcentaje (volúmenes). Emite `input` mientras se arrastra
   * y `change` al soltar, con el valor 0–1.
   */
  import { createEventDispatcher } from 'svelte';
  import Ico from './Ico.svelte';

  export let value = 0;
  export let label = '';
  export let icon: string | null = null;
  export let disabled = false;

  const id = `slider-${Math.random().toString(36).slice(2, 8)}`;
  const dispatch = createEventDispatcher<{ input: number; change: number }>();

  $: pct = Math.round(value * 100);

  function read(e: Event) {
    return Number((e.currentTarget as HTMLInputElement).value) / 100;
  }
</script>

<div class="ui-slider" class:is-disabled={disabled}>
  {#if icon}<span class="ui-row__lead ui-slider__icon" aria-hidden="true"><Ico n={icon} size={15} /></span>{/if}
  <label class="ui-slider__label" for={id}>{label}</label>
  <input
    {id}
    type="range"
    min="0"
    max="100"
    step="1"
    value={pct}
    {disabled}
    style:--fill={`${pct}%`}
    aria-valuetext={`${pct} %`}
    on:input={(e) => {
      value = read(e);
      dispatch('input', value);
    }}
    on:change={(e) => dispatch('change', read(e))}
  />
  <span class="ui-slider__value" aria-hidden="true">{pct}%</span>
</div>

<style>
  .ui-slider {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) minmax(90px, 1.4fr) 3.2em;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--hit-min);
    padding: var(--space-2);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-2xl);
    background: var(--surface);
  }
  .ui-slider.is-disabled {
    opacity: 0.55;
  }
  .ui-slider:not(:has(.ui-slider__icon)) {
    grid-template-columns: minmax(0, 1fr) minmax(90px, 1.4fr) 3.2em;
  }
  .ui-slider__icon {
    width: 28px;
    height: 28px;
  }
  .ui-slider__label {
    font-size: var(--text-label);
    font-weight: 700;
  }
  .ui-slider__value {
    font-size: var(--text-caption);
    color: var(--ink-muted);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  input[type='range'] {
    width: 100%;
    height: 20px;
    margin: 0;
    background: transparent;
    appearance: none;
    cursor: pointer;
  }
  input[type='range']:disabled {
    cursor: not-allowed;
  }
  input[type='range']::-webkit-slider-runnable-track {
    height: 6px;
    border-radius: var(--radius-pills);
    background: linear-gradient(to right, var(--accent) var(--fill), var(--surface-2) var(--fill));
    border: 1px solid var(--line-soft);
  }
  input[type='range']::-webkit-slider-thumb {
    appearance: none;
    width: 16px;
    height: 16px;
    margin-top: -6px;
    border-radius: 50%;
    border: 1px solid var(--line);
    background: var(--surface);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.2);
  }
  input[type='range']::-moz-range-track {
    height: 6px;
    border-radius: var(--radius-pills);
    background: var(--surface-2);
  }
  input[type='range']::-moz-range-progress {
    height: 6px;
    border-radius: var(--radius-pills);
    background: var(--accent);
  }
  input[type='range']::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1px solid var(--line);
    background: var(--surface);
  }
  input[type='range']:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: var(--radius-pills);
  }
</style>
