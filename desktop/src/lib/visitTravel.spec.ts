import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { activeVisit } from './activeVisit';
import {
  resetTravel,
  configureTravel,
  endTravel,
  registerTravelPresenter,
  restoreAway,
  restoreFromHistory,
  startTravel,
  travel,
  travelArrived,
  VISIT_LIVE_MS,
} from './visitTravel';

const state = () => get(travel).state;

beforeEach(() => {
  vi.useFakeTimers();
  resetTravel({ presenters: true });
  activeVisit.set('');
});
afterEach(() => {
  vi.useRealTimers();
});

describe('viaje de visita', () => {
  it('con mascota en pantalla: sale por el portal, espera fuera y vuelve', () => {
    registerTravelPresenter();
    startTravel('Marta', 0);
    expect(state()).toBe('departing');
    travelArrived();
    expect(state()).toBe('away');
    endTravel();
    expect(state()).toBe('returning');
    travelArrived();
    expect(get(travel)).toEqual({ state: 'home', friendName: '', startedAt: null });
  });

  it('sin mascota en pantalla (en su hábitat) cambia de estado sin animación', () => {
    startTravel('Marta', 0);
    expect(state()).toBe('away');
    endTravel();
    expect(state()).toBe('home');
  });

  it('si se termina la visita mientras aún entra, da media vuelta al acabar de entrar', () => {
    registerTravelPresenter();
    startTravel('Marta', 0);
    endTravel();
    expect(state()).toBe('departing');
    travelArrived();
    expect(state()).toBe('returning');
  });

  it('si la mascota se desmonta a mitad del viaje, no se queda colgado', () => {
    const leave = registerTravelPresenter();
    startTravel('Marta', 0);
    leave();
    expect(state()).toBe('away');
  });

  it('a los 15 min vuelve sola (el servidor ya cerró la visita)', () => {
    const expired = vi.fn(() => endTravel());
    configureTravel({ onExpire: expired });
    startTravel('Marta', Date.now());
    vi.advanceTimersByTime(VISIT_LIVE_MS - 1);
    expect(expired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(expired).toHaveBeenCalledOnce();
    expect(state()).toBe('home');
  });

  it('al terminar a mano se cancela la vuelta automática', () => {
    const expired = vi.fn();
    configureTravel({ onExpire: expired });
    startTravel('Marta', Date.now());
    endTravel();
    vi.advanceTimersByTime(VISIT_LIVE_MS * 2);
    expect(expired).not.toHaveBeenCalled();
  });

  it('una visita restaurada empieza fuera y respeta el tiempo que le queda', () => {
    const expired = vi.fn();
    configureTravel({ onExpire: expired });
    registerTravelPresenter();
    const now = Date.now();
    restoreAway('Marta', now - (VISIT_LIVE_MS - 1000), now);
    expect(state()).toBe('away');
    vi.advanceTimersByTime(1000);
    expect(expired).toHaveBeenCalledOnce();
  });

  it('no restaura una visita que ya habría caducado', () => {
    const now = Date.now();
    restoreAway('Marta', now - VISIT_LIVE_MS, now);
    expect(state()).toBe('home');
  });

  it('restaura desde el historial y marca la visita activa', () => {
    const now = Date.now();
    restoreFromHistory(
      [{ kind: 'habitat', direction: 'out', otherUserId: 'u-2', otherName: 'Marta', endedAt: null, createdAt: new Date(now - 60_000).toISOString() }],
      now,
    );
    expect(get(activeVisit)).toBe('u-2');
    expect(get(travel)).toMatchObject({ state: 'away', friendName: 'Marta' });
  });

  it('iniciar otra vez estando fuera no reinicia el viaje', () => {
    registerTravelPresenter();
    startTravel('Marta', 0);
    travelArrived();
    startTravel('Otro', 10);
    expect(get(travel)).toMatchObject({ state: 'away', friendName: 'Marta' });
  });
});
