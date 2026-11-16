import { describe, it, expect, beforeEach } from 'vitest';
import { BehaviorEngine, type CursorInfo, type PetGeometry } from './behaviorEngine';

describe('BehaviorEngine', () => {
  let engine: BehaviorEngine;
  const screenWidth = 1920;

  const defaultPet: PetGeometry = {
    x: 400,
    y: 900,
    size: 128,
    direction: 1,
  };

  const activeCursor: CursorInfo = {
    x: 450,
    y: 850,
    isMoving: true,
    idleDurationMs: 0,
  };

  beforeEach(() => {
    engine = new BehaviorEngine({
      pettingStrokeThreshold: 80,
      stalkingIdleTimeMs: 2000,
      zoomiesChance: 0,
      peekingChance: 0,
    });
  });

  it('inicia en estado idle', () => {
    expect(engine.getState()).toBe('idle');
  });

  it('entra en estado petting al acumular suficientes strokes de caricia', () => {
    expect(engine.recordStroke(30)).toBe(false);
    expect(engine.getState()).toBe('idle');

    expect(engine.recordStroke(60)).toBe(true);
    expect(engine.getState()).toBe('petting');
  });

  it('inicia y completa el evento high-five', () => {
    expect(engine.startHighFive()).toBe(true);
    expect(engine.getState()).toBe('high_five');

    expect(engine.completeHighFive()).toBe(true);
    expect(engine.getState()).toBe('idle');
  });

  it('entra en stalking si el cursor permanece quieto y cerca del suelo', () => {
    const idleCursor: CursorInfo = {
      x: 700,
      y: 900,
      isMoving: false,
      idleDurationMs: 2500,
    };

    const res = engine.update(0.1, idleCursor, defaultPet, screenWidth);
    expect(res.state).toBe('stalking');
    expect(res.targetX).toBeDefined();
  });

  it('indica orientación hacia el cursor si está a una distancia media en idle', () => {
    const nearbyCursor: CursorInfo = {
      x: 650,
      y: 900,
      isMoving: true,
      idleDurationMs: 0,
    };

    const res = engine.update(0.1, nearbyCursor, defaultPet, screenWidth);
    expect(res.shouldTurnToCursor).toBe(true);
  });
});
