<script lang="ts">
  /** Reproductor MP3 (spec 42): un tema lofi en bucle y capas de ambiente con su volumen. */
  import { MIXER_LAYERS, MIXER_TRACKS, isAudible } from '@pockai/audio';
  import {
    LAYER_LABEL,
    TRACK_LABEL,
    mixerSetLayerVolume,
    mixerSetTrack,
    mixerSetTrackVolume,
    mixerStore,
    mixerToggleLayer,
    mixerTogglePlay,
  } from '../lib/mixer';
  import Ico from './Ico.svelte';
  import { Badge, Button } from './ui';

  $: state = $mixerStore;
  $: playing = isAudible(state);
  const pct = (v: number) => Math.round(v * 100);
  const vol = (e: Event) => Number((e.currentTarget as HTMLInputElement).value) / 100;
</script>

<div class="mixer" class:playing>
  <div class="head">
    <Badge icon="music" tone={playing ? 'success' : 'neutral'}>{playing ? 'Sonando' : 'En pausa'}</Badge>
    <Button variant={playing ? 'ghost' : 'primary'} size="sm" icon={playing ? 'pause' : 'play'} on:click={mixerTogglePlay}>
      {playing ? 'Pausar' : 'Reproducir'}
    </Button>
  </div>

  <span class="form-label">Tema lofi</span>
  <div class="tracks" role="radiogroup" aria-label="Tema lofi">
    {#each MIXER_TRACKS as t (t)}
      <button type="button" role="radio" aria-checked={state.track === t} class="chip" class:on={state.track === t} on:click={() => mixerSetTrack(t)}>
        {TRACK_LABEL[t]}
      </button>
    {/each}
    <button type="button" role="radio" aria-checked={state.track === null} class="chip" class:on={state.track === null} on:click={() => mixerSetTrack(null)}>
      Sin música
    </button>
  </div>
  {#if state.track}
    <label class="slider">
      <Ico n="music" size={14} />
      <input type="range" min="0" max="100" value={pct(state.trackVolume)} aria-label="Volumen del tema" on:input={(e) => mixerSetTrackVolume(vol(e))} />
    </label>
  {/if}

  <span class="form-label">Ambiente (se suman por capas)</span>
  <div class="layers">
    {#each MIXER_LAYERS as l (l)}
      {@const on = state.layers[l] !== undefined}
      <div class="layer" class:on>
        <button type="button" class="chip" class:on aria-pressed={on} on:click={() => mixerToggleLayer(l)}>
          <Ico n={LAYER_LABEL[l].icon} size={14} />
          {LAYER_LABEL[l].label}
        </button>
        {#if on}
          <input
            type="range"
            min="0"
            max="100"
            value={pct(state.layers[l] ?? 0)}
            aria-label="Volumen de {LAYER_LABEL[l].label}"
            on:input={(e) => mixerSetLayerVolume(l, vol(e))}
          />
        {/if}
      </div>
    {/each}
  </div>
  <p class="form-hint">Sigue sonando con tu Pockai en el escritorio. El volumen general está en Ajustes › Sonido (Música y Ambiente).</p>
</div>

<style>
  .mixer {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-2xl);
    background: color-mix(in srgb, var(--color-electric-blue, #5c4ade) 8%, var(--surface));
  }
  .mixer.playing {
    border-color: var(--line);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .tracks,
  .layers {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  .layers {
    flex-direction: column;
  }
  .layer {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .layer input,
  .slider input {
    flex: 1;
    min-width: 0;
    accent-color: var(--success, #2fa36b);
  }
  .slider {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--ink-muted);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: var(--control-h-icon, 28px);
    padding: 2px var(--space-2);
    border: 1px solid var(--line-soft);
    border-radius: 999px;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: var(--text-caption);
    font-weight: 700;
    cursor: pointer;
  }
  .layer .chip {
    min-width: 7.5rem;
  }
  .chip.on {
    border-color: var(--success, #2fa36b);
    background: color-mix(in srgb, var(--success, #2fa36b) 16%, var(--surface));
  }
  .chip:focus-visible {
    outline: 2px solid var(--focus, currentColor);
    outline-offset: 2px;
  }
</style>
