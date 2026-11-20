<script lang="ts">
  /**
   * Ajustes › Apariencia: el tema de la app (tarjetas con su muestra) y el esquema claro/oscuro.
   * Guarda la elección en este dispositivo (src/appearance.ts). Si un tema solo admite un esquema,
   * las otras opciones salen desactivadas.
   */
  import Ico from './Ico.svelte';
  import Segmented from './Segmented.svelte';
  import { appearance, resolvedAppearance, setAppearance, type SchemeChoice } from './appearance';
  import { THEMES, getTheme } from './themes';

  const SCHEME_OPTIONS = [
    { value: 'system', label: 'Sistema', icon: 'monitor' },
    { value: 'light', label: 'Claro', icon: 'sun' },
    { value: 'dark', label: 'Oscuro', icon: 'moon' },
  ];

  $: current = getTheme($appearance.theme);
  $: locked = current.schemes.length === 1 ? current.schemes[0] : null;
  $: schemeValue = locked ?? $appearance.scheme;

  function pickScheme(e: CustomEvent<string>) {
    if (!locked) setAppearance({ scheme: e.detail as SchemeChoice });
  }
</script>

<div class="ui-appearance">
  <div class="ui-appearance__themes" role="radiogroup" aria-label="Tema">
    {#each THEMES as t (t.id)}
      {@const sw = t.swatch[$resolvedAppearance.scheme] ?? t.swatch[t.schemes[0]]}
      <button
        type="button"
        role="radio"
        aria-checked={$appearance.theme === t.id}
        class="ui-appearance__theme"
        class:active={$appearance.theme === t.id}
        on:click={() => setAppearance({ theme: t.id })}
      >
        <span class="ui-appearance__swatch" style="--sw-bg: {sw[0]}; --sw-surface: {sw[1]}; --sw-accent: {sw[2]}" aria-hidden="true">
          <i></i><i></i>
        </span>
        <span class="ui-appearance__name">
          {t.name}
          {#if $appearance.theme === t.id}<Ico n="check" size={14} />{/if}
        </span>
        <span class="ui-appearance__desc">{t.description}</span>
      </button>
    {/each}
  </div>

  <div class="ui-appearance__scheme">
    <span class="form-label">Modo</span>
    <Segmented label="Modo de color" options={SCHEME_OPTIONS} value={schemeValue} on:change={pickScheme} />
    {#if locked}
      <p class="form-hint">{current.name} solo tiene modo {locked === 'dark' ? 'oscuro' : 'claro'}.</p>
    {/if}
  </div>
</div>

<style>
  .ui-appearance {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .ui-appearance__themes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: var(--space-3);
  }
  .ui-appearance__theme {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-height: var(--hit-min);
    padding: var(--space-2);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-2xl);
    background: var(--surface);
    color: var(--ink);
    text-align: left;
    cursor: pointer;
    transition: border-color var(--dur-1), box-shadow var(--dur-1);
  }
  .ui-appearance__theme:hover {
    border-color: var(--line);
  }
  .ui-appearance__theme.active {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent);
  }
  .ui-appearance__swatch {
    position: relative;
    display: block;
    height: 56px;
    border-radius: var(--radius-md);
    background: var(--sw-bg);
    overflow: hidden;
    border: 1px solid var(--line-soft);
  }
  .ui-appearance__swatch i:first-child {
    position: absolute;
    inset: 10px 30% 10px 10px;
    border-radius: var(--radius-sm);
    background: var(--sw-surface);
  }
  .ui-appearance__swatch i:last-child {
    position: absolute;
    right: 10px;
    bottom: 10px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--sw-accent);
  }
  .ui-appearance__name {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-label);
    font-weight: 700;
  }
  .ui-appearance__desc {
    font-size: var(--text-caption);
    color: var(--ink-muted);
  }
  .ui-appearance__scheme {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .ui-appearance__scheme p {
    margin: 0;
  }
</style>
