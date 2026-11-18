import { describe, expect, it } from 'vitest';
import { CENTER, OFF_LEFT, OFF_RIGHT, REACT_MS, cameraOf, setPhase, startWalk, stepWalk, type StoryBeat, type WalkState } from './walk';

/** Avanza a pasos de 16 ms hasta que salga un aviso (o se agoten los pasos). */
function runUntilBeat(state: WalkState, max = 2000): { state: WalkState; beat: StoryBeat | null; ms: number } {
  let s = state;
  for (let i = 1; i <= max; i++) {
    const step = stepWalk(s, 16);
    s = step.state;
    if (step.beat) return { state: s, beat: step.beat, ms: i * 16 };
  }
  return { state: s, beat: null, ms: max * 16 };
}

describe('paseo de la escena de historia', () => {
  it('entra por la izquierda, anda hasta el centro y avisa una sola vez', () => {
    const start = startWalk('enter');
    expect(start.x).toBe(OFF_LEFT);
    expect(start.moving).toBe(true);
    const mid = stepWalk(start, 1000).state;
    expect(mid.x).toBeGreaterThan(OFF_LEFT);
    expect(mid.x).toBeLessThan(CENTER);
    expect(mid.moving).toBe(true);

    const arrived = runUntilBeat(start);
    expect(arrived.beat).toBe('arrived');
    expect(arrived.state.x).toBe(CENTER);
    expect(arrived.state.moving).toBe(false);
    // Entre 2 y 4 segundos de paseo: se ve andar sin hacerse largo
    expect(arrived.ms).toBeGreaterThan(2000);
    expect(arrived.ms).toBeLessThan(4000);
    expect(stepWalk(arrived.state, 16).beat).toBeNull();
  });

  it('recorre el ciclo completo: esperar, reaccionar y salir por la derecha', () => {
    let s = runUntilBeat(startWalk('enter')).state;
    s = setPhase(s, 'await');
    expect(stepWalk(s, 5000)).toEqual({ state: s, beat: null });

    s = setPhase(s, 'react');
    expect(stepWalk(s, REACT_MS - 100).beat).toBeNull();
    const reacted = runUntilBeat(s);
    expect(reacted.beat).toBe('reacted');
    expect(reacted.state.x).toBe(CENTER);

    s = setPhase(reacted.state, 'exit');
    expect(s.moving).toBe(true);
    const exited = runUntilBeat(s);
    expect(exited.beat).toBe('exited');
    expect(exited.state.x).toBe(OFF_RIGHT);
    expect(exited.state.emitted).toEqual(['arrived', 'reacted', 'exited']);
  });

  it('las fases solo avanzan: repetir un mensaje o uno atrasado no mueve nada', () => {
    const s = setPhase(runUntilBeat(startWalk('enter')).state, 'react');
    expect(setPhase(s, 'react')).toBe(s);
    expect(setPhase(s, 'await')).toBe(s);
    expect(setPhase(s, 'enter')).toBe(s);
  });

  it('una escena que llega ya empezada (recarga) aparece en su sitio y no repite avisos', () => {
    const awaiting = startWalk('await');
    expect(awaiting).toMatchObject({ x: CENTER, moving: false, emitted: ['arrived'] });
    expect(stepWalk(awaiting, 16).beat).toBeNull();

    const exiting = startWalk('exit');
    expect(exiting.emitted).toEqual(['arrived', 'reacted']);
    expect(runUntilBeat(exiting).beat).toBe('exited');
  });

  it('si el anfitrión no espera a `arrived`, el Pockai se coloca en el centro', () => {
    const s = setPhase(stepWalk(startWalk('enter'), 300).state, 'await');
    expect(s.x).toBe(CENTER);
    expect(s.emitted).toContain('arrived');
  });

  it('con movimiento reducido no anda: llega, reacciona y sale al instante', () => {
    const arrived = stepWalk(startWalk('enter'), 16, true);
    expect(arrived).toMatchObject({ beat: 'arrived', state: { x: CENTER, moving: false } });
    const reacted = stepWalk(setPhase(arrived.state, 'react'), 16, true);
    expect(reacted.beat).toBe('reacted');
    const exited = stepWalk(setPhase(reacted.state, 'exit'), 16, true);
    expect(exited).toMatchObject({ beat: 'exited', state: { x: OFF_RIGHT } });
  });

  it('la cámara sigue al Pockai sin salirse del escenario', () => {
    expect(cameraOf(startWalk('enter'))).toBe(0);
    expect(cameraOf(startWalk('await'))).toBe(CENTER);
    expect(cameraOf({ ...startWalk('exit'), x: OFF_RIGHT })).toBe(1);
  });
});
