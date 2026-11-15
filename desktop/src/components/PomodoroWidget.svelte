<script lang="ts">
  import {
    pomodoroStore,
    startPomodoro,
    pausePomodoro,
    resumePomodoro,
    stopPomodoro,
  } from '../lib/pomodoro';
  import { Play, Pause, RotateCcw, Clock, Coffee, Sparkles } from 'lucide-svelte';

  export let compact: boolean = false;

  $: state = $pomodoroStore;
  $: minutes = Math.floor(state.timeLeft / 60);
  $: seconds = state.timeLeft % 60;
  $: formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  $: totalSec = state.phase === 'work' ? state.workDuration : state.breakDuration;
  $: progressPct = totalSec > 0 ? Math.max(0, Math.min(100, ((totalSec - state.timeLeft) / totalSec) * 100)) : 0;
</script>

<div class="pomodoro-container" class:compact>
  <div class="timer-card" class:work-phase={state.phase === 'work'} class:break-phase={state.phase === 'break'}>
    <div class="phase-header">
      {#if state.phase === 'work'}
        <span class="phase-badge work">
          <Clock size={14} /> Modo Foco / Estudio
        </span>
      {:else if state.phase === 'break'}
        <span class="phase-badge break">
          <Coffee size={14} /> Pausa & Descanso
        </span>
      {:else}
        <span class="phase-badge idle">
          <Clock size={14} /> Pomodoro Listo
        </span>
      {/if}

      <span class="sessions-badge" title="Sesiones completadas hoy">
        <Sparkles size={12} /> {state.sessionsCompleted} {state.sessionsCompleted === 1 ? 'sesión' : 'sesiones'}
      </span>
    </div>

    <!-- Reloj Digital y Barra -->
    <div class="clock-display">
      <span class="digits">{formattedTime}</span>
    </div>

    <div class="progress-bar-bg">
      <div class="progress-bar-fill" style="width: {progressPct}%;"></div>
    </div>

    <!-- Controles -->
    <div class="controls-row">
      {#if !state.isRunning && state.phase === 'idle'}
        <button class="btn btn-primary" on:click={() => startPomodoro(25, 5)}>
          <Play size={16} /> Empezar 25m
        </button>
        <button class="btn btn-secondary" on:click={() => startPomodoro(45, 10)}>
          45m
        </button>
      {:else if state.isRunning}
        <button class="btn btn-warning" on:click={pausePomodoro}>
          <Pause size={16} /> Pausar
        </button>
        <button class="btn btn-outline" on:click={stopPomodoro}>
          <RotateCcw size={16} /> Reiniciar
        </button>
      {:else}
        <button class="btn btn-primary" on:click={resumePomodoro}>
          <Play size={16} /> Reanudar
        </button>
        <button class="btn btn-outline" on:click={stopPomodoro}>
          <RotateCcw size={16} /> Reiniciar
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .pomodoro-container {
    width: 100%;
  }

  .timer-card {
    background: rgba(15, 23, 42, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  .timer-card.work-phase {
    border-color: rgba(99, 102, 241, 0.4);
    background: linear-gradient(180deg, rgba(30, 27, 75, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%);
  }

  .timer-card.break-phase {
    border-color: rgba(34, 197, 94, 0.4);
    background: linear-gradient(180deg, rgba(20, 83, 45, 0.5) 0%, rgba(15, 23, 42, 0.8) 100%);
  }

  .phase-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .phase-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 6px;
  }

  .phase-badge.work {
    background: rgba(99, 102, 241, 0.2);
    color: #a5b4fc;
    border: 1px solid rgba(99, 102, 241, 0.35);
  }

  .phase-badge.break {
    background: rgba(34, 197, 94, 0.2);
    color: #86efac;
    border: 1px solid rgba(34, 197, 94, 0.35);
  }

  .phase-badge.idle {
    background: rgba(148, 163, 184, 0.15);
    color: #cbd5e1;
  }

  .sessions-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: #fbbf24;
    background: rgba(245, 158, 11, 0.1);
    padding: 3px 8px;
    border-radius: 6px;
  }

  .clock-display {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 8px 0;
  }

  .digits {
    font-family: monospace;
    font-size: 38px;
    font-weight: 700;
    letter-spacing: 2px;
    color: #f8fafc;
  }

  .progress-bar-bg {
    width: 100%;
    height: 6px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 999px;
    overflow: hidden;
  }

  .progress-bar-fill {
    height: 100%;
    background: #6366f1;
    border-radius: 999px;
    transition: width 0.3s ease;
  }

  .timer-card.break-phase .progress-bar-fill {
    background: #22c55e;
  }

  .controls-row {
    display: flex;
    gap: 8px;
    justify-content: center;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    padding: 8px 16px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-primary {
    background: #4f46e5;
    color: #ffffff;
  }

  .btn-primary:hover {
    background: #4338ca;
  }

  .btn-secondary {
    background: rgba(255, 255, 255, 0.08);
    color: #e2e8f0;
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  .btn-warning {
    background: #f59e0b;
    color: #ffffff;
  }

  .btn-warning:hover {
    background: #d97706;
  }

  .btn-outline {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #94a3b8;
  }

  .btn-outline:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #e2e8f0;
  }
</style>
