import { describe, it, expect, beforeEach } from 'vitest';
import {
  pomodoroStore,
  startPomodoro,
  pausePomodoro,
  resumePomodoro,
  stopPomodoro,
} from './pomodoro';
import { get } from 'svelte/store';

describe('pomodoro', () => {
  beforeEach(() => {
    stopPomodoro();
  });

  it('inicia el temporizador de foco correctamente', () => {
    startPomodoro(25, 5);
    const s = get(pomodoroStore);

    expect(s.phase).toBe('work');
    expect(s.isRunning).toBe(true);
    expect(s.timeLeft).toBe(25 * 60);
    expect(s.workDuration).toBe(25 * 60);
    expect(s.breakDuration).toBe(5 * 60);
  });

  it('pausa y reanuda el temporizador', () => {
    startPomodoro(25, 5);
    pausePomodoro();
    expect(get(pomodoroStore).isRunning).toBe(false);

    resumePomodoro();
    expect(get(pomodoroStore).isRunning).toBe(true);
  });

  it('detiene y reinicia al estado inicial', () => {
    startPomodoro(25, 5);
    stopPomodoro();
    const s = get(pomodoroStore);

    expect(s.phase).toBe('idle');
    expect(s.isRunning).toBe(false);
  });
});
