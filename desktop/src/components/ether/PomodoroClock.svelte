<script lang="ts">
  /**
   * Reloj del pomodoro traído del Éter. El marco es pixel art (`clockArt.ts`) teñido con el Flujo
   * del Pockai; la cuenta atrás va en DOM encima de la esfera. Al pasar el ratón salen los
   * controles (pausar/reanudar, detener con confirmación), los mismos que en el panel.
   *
   * El contador sigue a la store del pomodoro (la verdad, al instante); el sello de pausa sigue a
   * lo que se VE del objeto (`shown`), que cambia cuando la hebra del Pockai lo toca.
   */
  import { onMount } from 'svelte';
  import { CanvasSink } from '@pockai/scene/effects';
  import { pomodoroStore, pausePomodoro, resumePomodoro, stopPomodoro } from '../../lib/pomodoro';
  import { etherPalette, etherSeed, type EtherObjectView } from '../../lib/etherObjects/store';
  import { CLOCK_FACE, CLOCK_H, CLOCK_SCALE, CLOCK_W, drawClock } from '../../lib/etherObjects/clockArt';
  import { Button } from '../ui';

  export let object: EtherObjectView;

  let canvas: HTMLCanvasElement;
  let confirmStop = false;

  $: s = $pomodoroStore;
  $: total = s.phase === 'work' ? s.workDuration : s.breakDuration;
  $: progress = total > 0 ? Math.max(0, Math.min(1, (total - s.timeLeft) / total)) : 0;
  $: paused = object.shown === 'paused';
  $: digits = `${String(Math.floor(s.timeLeft / 60)).padStart(2, '0')}:${String(s.timeLeft % 60).padStart(2, '0')}`;
  $: label = s.phase === 'break' ? 'Descanso' : 'Foco';
  // Repinta el marco cuando cambia algo que se ve (el progreso va a saltos de anillo, no cada segundo)
  $: ringStep = Math.round(progress * 48);
  $: paint(canvas, $etherPalette, ringStep, s.phase, paused, $etherSeed);
  $: if (s.phase === 'idle') confirmStop = false;

  function paint(...deps: unknown[]) {
    void deps;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawClock(new CanvasSink(ctx, CLOCK_W, CLOCK_H, CLOCK_SCALE), {
      palette: $etherPalette,
      progress: ringStep / 48,
      phase: s.phase,
      paused,
      seed: $etherSeed,
    });
  }

  onMount(() => paint());
</script>

<div class="clock" class:paused style="--face-x: {CLOCK_FACE.x}px; --face-y: {CLOCK_FACE.y}px; --glow: {$etherPalette.glow}; --light: {$etherPalette.light}; --mid: {$etherPalette.mid}">
  <canvas bind:this={canvas} width={CLOCK_W * CLOCK_SCALE} height={CLOCK_H * CLOCK_SCALE} aria-hidden="true"></canvas>
  <div class="face" role="timer" aria-label="{label}: quedan {digits}{paused ? ', en pausa' : ''}">
    <span class="phase">{paused ? 'Pausa' : label}</span>
    <span class="digits">{digits}</span>
  </div>

  <div class="controls" class:open={confirmStop}>
    {#if confirmStop}
      <span class="ask">¿Detener?</span>
      <Button variant="danger" size="sm" on:click={() => { confirmStop = false; stopPomodoro(); }}>Sí</Button>
      <Button variant="ghost" size="sm" on:click={() => (confirmStop = false)}>No</Button>
    {:else}
      {#if s.isRunning}
        <Button size="sm" icon="pause" iconOnly label="Pausar pomodoro" on:click={pausePomodoro} />
      {:else}
        <Button variant="primary" size="sm" icon="play" iconOnly label="Reanudar pomodoro" on:click={resumePomodoro} />
      {/if}
      <Button variant="ghost" size="sm" icon="x" iconOnly label="Detener pomodoro" on:click={() => (confirmStop = true)} />
    {/if}
  </div>
</div>

<style>
  .clock {
    position: relative;
    width: 96px;
    height: 108px;
  }
  canvas {
    display: block;
    image-rendering: pixelated;
  }
  .face {
    position: absolute;
    left: var(--face-x);
    top: var(--face-y);
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    pointer-events: none;
    line-height: 1;
  }
  .phase {
    font-family: var(--font-ui);
    font-size: 8px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--mid);
  }
  .digits {
    margin-top: 2px;
    font-family: var(--font-display);
    font-size: 15px;
    font-variant-numeric: tabular-nums;
    color: var(--light);
    text-shadow: 0 0 4px var(--glow);
  }
  .paused .digits {
    opacity: 0.6;
    text-shadow: none;
  }
  .controls {
    position: absolute;
    /* Dentro de la caja del reloj: fuera de ella el click-through no la vería */
    left: 50%;
    bottom: 0;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: center;
    width: max-content;
    max-width: 96px;
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
  .clock:hover .controls,
  .clock:focus-within .controls,
  .controls.open {
    opacity: 1;
    pointer-events: auto;
  }
  .ask {
    flex: 1 1 100%;
    text-align: center;
    font-size: var(--text-caption);
    font-weight: 700;
    color: var(--ink-muted);
  }
  @media (prefers-reduced-motion: reduce) {
    .controls {
      transition: none;
    }
  }
</style>
