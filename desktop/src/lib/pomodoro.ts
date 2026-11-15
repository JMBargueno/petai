import { writable } from 'svelte/store';

export type PomodoroPhase = 'idle' | 'work' | 'break';

export interface PomodoroState {
  phase: PomodoroPhase;
  isRunning: boolean;
  timeLeft: number;         // en segundos
  workDuration: number;     // en segundos (ej. 25 * 60)
  breakDuration: number;    // en segundos (ej. 5 * 60)
  sessionsCompleted: number;
}

const initialState: PomodoroState = {
  phase: 'idle',
  isRunning: false,
  timeLeft: 25 * 60,
  workDuration: 25 * 60,
  breakDuration: 5 * 60,
  sessionsCompleted: 0,
};

export const pomodoroStore = writable<PomodoroState>(initialState);

let pomodoroTimer: ReturnType<typeof setInterval> | null = null;

function notifyPet(eventType: 'work_start' | 'work_finish' | 'break_finish') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('petai:pomodoro_event', { detail: { eventType } }));
}

export function startPomodoro(workMinutes = 25, breakMinutes = 5) {
  const workSec = workMinutes * 60;
  const breakSec = breakMinutes * 60;

  pomodoroStore.update((s) => ({
    ...s,
    phase: 'work',
    isRunning: true,
    timeLeft: workSec,
    workDuration: workSec,
    breakDuration: breakSec,
  }));

  notifyPet('work_start');

  if (pomodoroTimer) clearInterval(pomodoroTimer);
  pomodoroTimer = setInterval(tickPomodoro, 1000);
}

export function pausePomodoro() {
  pomodoroStore.update((s) => ({ ...s, isRunning: false }));
  if (pomodoroTimer) {
    clearInterval(pomodoroTimer);
    pomodoroTimer = null;
  }
}

export function resumePomodoro() {
  pomodoroStore.update((s) => ({ ...s, isRunning: true }));
  if (pomodoroTimer) clearInterval(pomodoroTimer);
  pomodoroTimer = setInterval(tickPomodoro, 1000);
}

export function stopPomodoro() {
  if (pomodoroTimer) {
    clearInterval(pomodoroTimer);
    pomodoroTimer = null;
  }
  pomodoroStore.update((s) => ({
    ...s,
    phase: 'idle',
    isRunning: false,
    timeLeft: s.workDuration,
  }));
}

function tickPomodoro() {
  pomodoroStore.update((s) => {
    if (!s.isRunning) return s;

    if (s.timeLeft > 1) {
      return { ...s, timeLeft: s.timeLeft - 1 };
    }

    // Fin de la fase actual
    if (s.phase === 'work') {
      notifyPet('work_finish');
      return {
        ...s,
        phase: 'break',
        timeLeft: s.breakDuration,
        sessionsCompleted: s.sessionsCompleted + 1,
      };
    } else if (s.phase === 'break') {
      notifyPet('break_finish');
      return {
        ...s,
        phase: 'work',
        timeLeft: s.workDuration,
      };
    }

    return s;
  });
}
