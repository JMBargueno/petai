<script lang="ts">
  import {
    pomodoroStore,
    startPomodoro,
    pausePomodoro,
    resumePomodoro,
    stopPomodoro,
  } from '../lib/pomodoro';
  import { Badge, Button, ProgressBar } from './ui';

  export let compact: boolean = false;

  $: state = $pomodoroStore;
  $: minutes = Math.floor(state.timeLeft / 60);
  $: seconds = state.timeLeft % 60;
  $: formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  $: totalSec = state.phase === 'work' ? state.workDuration : state.breakDuration;
  $: progressPct = totalSec > 0 ? Math.max(0, Math.min(100, ((totalSec - state.timeLeft) / totalSec) * 100)) : 0;

  $: phase =
    state.phase === 'work'
      ? { label: 'Modo foco', icon: 'brain', color: 'var(--color-electric-blue)' }
      : state.phase === 'break'
        ? { label: 'Descanso', icon: 'cookie', color: 'var(--color-mint-pop)' }
        : { label: 'Pomodoro listo', icon: 'timer', color: 'var(--surface-2)' };
</script>

<div class="pomodoro" class:compact style="--pomo-c: {phase.color}">
  <div class="head">
    <Badge color={state.phase === 'idle' ? null : phase.color} icon={phase.icon}>{phase.label}</Badge>
    <Badge size="sm" icon="xp" title="Sesiones completadas hoy">
      {state.sessionsCompleted} {state.sessionsCompleted === 1 ? 'sesión' : 'sesiones'}
    </Badge>
  </div>

  <span class="digits">{formattedTime}</span>
  <ProgressBar value={progressPct} color={state.phase === 'idle' ? null : phase.color} />

  <div class="controls">
    {#if !state.isRunning && state.phase === 'idle'}
      <Button variant="primary" size="sm" icon="play" class="grow" on:click={() => startPomodoro(25, 5)}>Empezar 25m</Button>
      <Button size="sm" on:click={() => startPomodoro(45, 10)}>45m</Button>
    {:else if state.isRunning}
      <Button size="sm" icon="pause" class="grow" on:click={pausePomodoro}>Pausar</Button>
      <Button variant="ghost" size="sm" icon="refresh" on:click={stopPomodoro}>Reiniciar</Button>
    {:else}
      <Button variant="primary" size="sm" icon="play" class="grow" on:click={resumePomodoro}>Reanudar</Button>
      <Button variant="ghost" size="sm" icon="refresh" on:click={stopPomodoro}>Reiniciar</Button>
    {/if}
  </div>
</div>

<style>
  .pomodoro {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-2xl);
    background: color-mix(in srgb, var(--pomo-c) 12%, var(--surface));
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .digits {
    font-family: var(--font-display);
    font-size: 40px;
    line-height: 1;
    text-align: center;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
  }
  .compact .digits {
    font-size: 28px;
  }
  .controls {
    display: flex;
    gap: 6px;
  }
  .controls :global(.grow) {
    flex: 1;
  }
</style>
