import { describe, expect, it } from 'vitest';
import { SLOTS, addMinute, addPomodoro, buildDigest, emptyState, loadState, slotOf } from './contextDigest';

const at = (h: number) => new Date(2026, 10, 16, h, 30);

describe('contextDigest', () => {
  it('cuenta minutos por categoría y franja de 4 h; ignora genérico y desconocido', () => {
    let s = emptyState(0);
    s = addMinute(s, 'coding', at(17));
    s = addMinute(s, 'coding', at(17));
    s = addMinute(s, 'generic', at(17));
    s = addMinute(s, null, at(17));
    expect(slotOf(at(17))).toBe(4);
    expect(s.appMinutes).toEqual({ coding: [0, 0, 0, 0, 2, 0] });
  });

  it('el cuerpo nunca supera los límites del servidor', () => {
    let s = emptyState(0);
    for (let i = 0; i < 300; i++) s = addMinute(s, 'video', at(21)); // 300 min en una franja de 240
    for (let i = 0; i < 40; i++) s = addPomodoro(s, 25);
    const body = buildDigest(s)!;
    expect(body.appMinutes!.video![5]).toBe(240);
    expect(body.pomodoros).toHaveLength(30);
    expect(JSON.stringify(body).length).toBeLessThan(2048);
  });

  it('si se acumulan varios días, escala los minutos manteniendo la proporción', () => {
    const s = { ...emptyState(0), appMinutes: { coding: Array(SLOTS).fill(240), music: Array(SLOTS).fill(240) } };
    const body = buildDigest(s)!;
    const total = Object.values(body.appMinutes!).flat().reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(2400);
    expect(body.appMinutes!.coding).toEqual(body.appMinutes!.music);
  });

  it('sin datos no envía nada; los Pomodoro fuera de rango se ignoran', () => {
    expect(buildDigest(emptyState(0))).toBeNull();
    expect(addPomodoro(emptyState(0), 0).pomodoros).toEqual([]);
    expect(addPomodoro(emptyState(0), 49.6).pomodoros).toEqual([50]);
  });

  it('un estado guardado corrupto empieza de cero', () => {
    expect(loadState({ getItem: () => '{not json' }).pomodoros).toEqual([]);
    expect(loadState({ getItem: () => '{"lastSentAt":5,"pomodoros":[25]}' })).toEqual({ appMinutes: {}, pomodoros: [25], lastSentAt: 5 });
  });
});
