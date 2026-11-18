import * as fs from 'fs';
import * as path from 'path';
import { isBehavior } from './behavior.engine';
import { MemoryRow } from './memory.engine';
import { PersonalityConfig } from './mind.types';
import { SituationInput, buildSituation, isPrivateEpisode, resolveMode, untoldFor } from './situation.engine';

const balance = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../shared/game-data/balance.json'), 'utf8'));
const cfg = balance.personality as PersonalityConfig;
const NOW = new Date('2026-11-18T12:00:00Z');

const row = (over: Partial<MemoryRow>): MemoryRow => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  kind: 'event',
  layer: 'episodic',
  content: 'algo',
  importance: 0.5,
  valence: 0,
  createdAt: NOW,
  ...over,
});

/** Memoria de una mascota con un poco de todo, incluido un dato marcado de su entrenador. */
const MEMORIES: MemoryRow[] = [
  row({ id: 'fact', layer: 'semantic', kind: 'fact', content: 'DATO-MARCADO: mi entrenador vive en Lugo' }),
  row({ id: 'habit', layer: 'semantic', kind: 'habit', content: 'Suele programar por la tarde' }),
  row({ id: 'emo-owner', layer: 'emotional', kind: 'relation', key: 'emo:owner', subject: 'owner', content: 'Mi entrenador' }),
  row({ id: 'emo-ana', layer: 'emotional', kind: 'relation', key: 'emo:user:ana', subject: 'user:ana', content: 'Ana (otro entrenador)' }),
  row({ id: 'summary', kind: 'summary', content: 'Hablaron de su trabajo' }),
  row({ id: 'chat-template', key: 'ep:affection', subject: 'owner', content: 'Mi entrenador me dijo que me quiere.' }),
  row({ id: 'chat-extracted', subject: 'owner', content: 'Mi entrenador me contó que aprobó el examen' }),
  row({ id: 'auto', content: 'Encontré una semilla solar explorando.' }),
  row({ id: 'adventure', kind: 'adventure', content: 'Viví una aventura: la cueva de los ecos.' }),
  row({ id: 'with-ana', kind: 'encounter', subject: 'user:ana', content: 'Ana vino a visitarme con Lumo.' }),
  row({ id: 'with-lumo', kind: 'encounter', subject: 'pet:lumo', content: 'Jugué al pilla-pilla con Lumo.' }),
  row({ id: 'with-brasa', kind: 'encounter', subject: 'pet:brasa', content: 'Conocí a Brasa.' }),
  row({ id: 'told', content: 'Dormí una siesta al sol.', lastRecalledAt: NOW }),
];

const input = (over: Partial<SituationInput> = {}): SituationInput => ({
  audience: 'owner',
  pet: { hunger: 70, energy: 70, hygiene: 70, happiness: 60, health: 100, sleeping: false, sick: false },
  now: NOW,
  memories: MEMORIES,
  ...over,
});

const build = (over: Partial<SituationInput> = {}) => buildSituation(input(over), cfg, isBehavior);
const ids = (s: ReturnType<typeof build>) => s.untold.map((u) => u.id).sort();

describe('Situation Engine — pizarra de situación (spec 37 §4.1)', () => {
  it('la misma entrada da la misma pizarra', () => {
    expect(build()).toEqual(build());
  });

  it('recoge cómo está, cuánto lleva sin su entrenador y lo que hizo hace poco', () => {
    const s = build({ lastOwnerInteractionAt: new Date(NOW.getTime() - 90 * 60_000), recent: ['listen', 'ask_back'], pet: { energy: 12, sick: true } });
    expect(s.needs).toMatchObject({ energy: 12, sick: true, hunger: 60 });
    expect(s.awayMinutes).toBe(90);
    expect(s.recent).toEqual(['listen', 'ask_back']);
  });

  it('el historial guardado se limpia: sin ids desconocidos y sin pasar de la ventana', () => {
    const long = ['listen', 'reaccion_vieja', 7, 'ask_back', 'greet', 'cuddle', 'sulk', 'yawn'];
    const s = build({ recent: long });
    expect(s.recent.length).toBeLessThanOrEqual(cfg.behavior.antiRepeat!.window);
    expect(s.recent).not.toContain('reaccion_vieja');
    expect(s.recent[s.recent.length - 1]).toBe('yawn');
  });

  it('a su entrenador puede contarle lo que vivió sin él, no lo que ya hablaron', () => {
    expect(ids(build())).toEqual(['adventure', 'auto', 'with-ana', 'with-brasa', 'with-lumo']);
  });

  it('lo que ya ha contado no vuelve a salir como pendiente', () => {
    expect(ids(build())).not.toContain('told');
  });

  it('ante un visitante: nada de la capa semántica ni de la relación con su entrenador', () => {
    const s = build({ audience: 'visitor', subject: { key: 'user:ana', valence: 0.3, stage: 'acquaintance' } });
    const dump = JSON.stringify(s);
    expect(dump).not.toContain('DATO-MARCADO');
    expect(dump).not.toContain('programar');
    expect(dump).not.toContain('emo:owner');
    expect(dump).not.toContain('me quiere');
    expect(dump).not.toContain('aprobó');
    // Solo lo que vivió con ese visitante
    expect(ids(s)).toEqual(['with-ana']);
    expect(s.subject?.key).toBe('user:ana');
  });

  it('ante un visitante no se cuela la fila del entrenador aunque se la pasen como sujeto', () => {
    const s = build({ audience: 'visitor', subject: { key: 'owner', valence: 0.9, stage: null } });
    expect(s.subject).toBeNull();
    expect(s.untold).toEqual([]);
  });

  it('ante otro Pockai: lo vivido con él y lo propio que no es privado, nunca lo del chat', () => {
    const s = build({ audience: 'pockai', subject: { key: 'pet:lumo', valence: 0.4, stage: 'friend' } });
    expect(ids(s)).toEqual(['adventure', 'auto', 'with-ana', 'with-brasa', 'with-lumo']);
    const dump = JSON.stringify(s);
    expect(dump).not.toContain('DATO-MARCADO');
    expect(dump).not.toContain('me quiere');
    expect(dump).not.toContain('aprobó');
    expect(dump).not.toContain('Hablaron de su trabajo');
  });

  it('a solas no tiene a quién contar nada', () => {
    expect(build({ audience: 'alone' }).untold).toEqual([]);
  });

  it('distingue lo privado (nacido del chat) de lo vivido por su cuenta', () => {
    expect(isPrivateEpisode({ kind: 'event', key: 'ep:affection', subject: 'owner' })).toBe(true);
    expect(isPrivateEpisode({ kind: 'event', key: null, subject: 'owner' })).toBe(true);
    expect(isPrivateEpisode({ kind: 'summary', key: null, subject: null })).toBe(true);
    expect(isPrivateEpisode({ kind: 'encounter', key: null, subject: 'pet:x' })).toBe(false);
    expect(isPrivateEpisode({ kind: 'adventure', key: null, subject: null })).toBe(false);
    expect(untoldFor([], 'owner', null)).toEqual([]);
  });
});

describe('Situation Engine — modo superior (spec 37 §4.2)', () => {
  const awake = { sleeping: false, sick: false };

  it('dormir y enfermar mandan sobre todo lo demás', () => {
    expect(resolveMode({ sleeping: true, sick: true }, 'owner', { hosting: true })).toBe('asleep');
    expect(resolveMode({ sleeping: false, sick: true }, 'owner', { visiting: true })).toBe('sick');
  });

  it('distingue recibir visita de ir de visita, y estar con su entrenador de estar sola', () => {
    expect(resolveMode(awake, 'visitor', { hosting: true })).toBe('hosting');
    expect(resolveMode(awake, 'pockai', { visiting: true })).toBe('visiting');
    expect(resolveMode(awake, 'owner')).toBe('with_owner');
    expect(resolveMode(awake, 'alone')).toBe('alone');
  });

  it('la pizarra lleva el modo calculado', () => {
    expect(build({ pet: { sleeping: true } }).mode).toBe('asleep');
    expect(build().mode).toBe('with_owner');
    expect(build({ audience: 'visitor', hosting: true }).mode).toBe('hosting');
  });
});
