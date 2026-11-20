<script lang="ts">
  /**
   * Reproductor MP3 traído del Éter (spec 42). El cuerpo es pixel art (`mp3Art.ts`) teñido con el
   * Flujo del Pockai; el ecualizador baila mientras suena. Al pasar el ratón salen los controles
   * (pausar, siguiente tema), los mismos que en el panel.
   */
  import { onDestroy, onMount } from 'svelte';
  import { CanvasSink } from '@pockai/scene/effects';
  import { isAudible } from '@pockai/audio';
  import { mixerNextTrack, mixerStore, mixerTogglePlay, TRACK_LABEL } from '../../lib/mixer';
  import { etherPalette, etherReduced, etherSeed, type EtherObjectView } from '../../lib/etherObjects/store';
  import { MP3_H, MP3_SCALE, MP3_W, drawMp3 } from '../../lib/etherObjects/mp3Art';
  import { Button } from '../ui';

  export let object: EtherObjectView;

  let canvas: HTMLCanvasElement;
  let beat = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  $: s = $mixerStore;
  $: playing = isAudible(s) && object.shown !== null;
  $: bars = (s.track ? 1 : 0) + Object.keys(s.layers).length;
  $: title = s.track ? TRACK_LABEL[s.track] : 'Solo ambiente';
  $: paint(canvas, $etherPalette, playing, beat, bars, $etherSeed);
  $: animate(playing);

  function animate(on: boolean) {
    if (on && !timer && !etherReduced) timer = setInterval(() => (beat = (beat + 1) % 997), 160);
    if (!on && timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function paint(...deps: unknown[]) {
    void deps;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawMp3(new CanvasSink(ctx, MP3_W, MP3_H, MP3_SCALE), { palette: $etherPalette, playing, beat, bars, seed: $etherSeed });
  }

  onMount(() => paint());
  onDestroy(() => timer && clearInterval(timer));
</script>

<div class="mp3" class:playing role="group" aria-label="Reproductor MP3: {title}{playing ? '' : ', en pausa'}">
  <canvas bind:this={canvas} width={MP3_W * MP3_SCALE} height={MP3_H * MP3_SCALE} aria-hidden="true"></canvas>
  <div class="controls">
    <Button size="sm" icon={playing ? 'pause' : 'play'} iconOnly label={playing ? 'Pausar música' : 'Reproducir música'} on:click={mixerTogglePlay} />
    <Button variant="ghost" size="sm" icon="next" iconOnly label="Siguiente tema" on:click={mixerNextTrack} />
  </div>
</div>

<style>
  .mp3 {
    position: relative;
    width: 72px;
    height: 100px;
  }
  canvas {
    display: block;
    image-rendering: pixelated;
  }
  .controls {
    position: absolute;
    /* Dentro de la caja: fuera de ella el click-through no la vería */
    left: 50%;
    bottom: 0;
    transform: translateX(-50%);
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: 14px;
    background: var(--surface);
    border: 1px solid var(--line-soft);
    box-shadow: var(--shadow-2, 0 4px 12px rgb(0 0 0 / 0.2));
    opacity: 0;
    pointer-events: none;
    transition: opacity 120ms ease;
  }
  .mp3:hover .controls,
  .mp3:focus-within .controls {
    opacity: 1;
    pointer-events: auto;
  }
  @media (prefers-reduced-motion: reduce) {
    .controls {
      transition: none;
    }
  }
</style>
