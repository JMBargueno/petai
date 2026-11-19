import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TALK_LEVELS,
  createRng,
  desktopGapMs,
  inQuietHours,
  maySpeak,
  mobileDailyCap,
  neutralDims,
  normalizeInitiative,
  shouldGreetReturn,
  takeInitiative,
  talkFactor,
  type InitiativeConfig,
  type InitiativeInput,
  type PhraseEntry,
} from './index';

const balance = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../game-data/balance.json'), 'utf8'));
const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../game-data/phrases.json'), 'utf8'));
const cfg = balance.personality.initiative as InitiativeConfig;
const PHRASES = data.phrases as PhraseEntry[];
const NOW = Date.UTC(2026, 10, 19, 10, 0, 0);
const MIN = 60_000;

const input = (over: Partial<InitiativeInput> = {}): InitiativeInput => ({
  channel: 'desktop',
  level: 'normal',
  dims: neutralDims(),
  state: {},
  now: NOW,
  localHour: 10,
  localDay: '2026-11-19',
  back: false,
  asleep: false,
  focus: false,
  ...over,
});
const ctx = (flags: string[] = [], vars: Record<string, string> = {}) => ({
  vars: { 'nombre.custodio': 'Jose', 'nombre.pockai': 'Lumo', 'especie.pockai': 'Axolunar', ...vars },
  lang: 'es',
  flags: new Set(flags),
  rng: createRng(11),
});

describe('iniciativa: cuánto puede interrumpir', () => {
  it('hay tres niveles, de más callado a más hablador', () => {
    expect(TALK_LEVELS).toEqual(['quiet', 'normal', 'chatty']);
    const dims = neutralDims();
    expect(desktopGapMs('chatty', dims, cfg)).toBeLessThan(desktopGapMs('normal', dims, cfg));
    expect(mobileDailyCap('chatty', dims, cfg)).toBeGreaterThan(mobileDailyCap('normal', dims, cfg));
    expect(cfg.levels.quiet.onlyOnReturn).toBe(true);
  });

  it('el carácter cambia la frecuencia: un sociable e inquieto habla más a menudo que un reservado y tranquilo', () => {
    const outgoing = { ...neutralDims(), sociability: 95, temper: 90 };
    const reserved = { ...neutralDims(), sociability: 5, temper: 10 };
    expect(talkFactor(neutralDims(), cfg)).toBe(1);
    expect(talkFactor(outgoing, cfg)).toBeGreaterThan(1.3);
    expect(talkFactor(reserved, cfg)).toBeLessThan(0.75);
    expect(desktopGapMs('normal', outgoing, cfg)).toBeLessThan(desktopGapMs('normal', reserved, cfg));
    expect(mobileDailyCap('normal', outgoing, cfg)).toBeGreaterThanOrEqual(mobileDailyCap('normal', reserved, cfg));
  });

  it('pero dentro de unos límites: ni el más extrovertido agobia ni el más reservado enmudece', () => {
    const extreme = (v: number) => ({ curiosity: v, sociability: v, bravery: v, affection: v, temper: v });
    expect(talkFactor(extreme(100), cfg)).toBeLessThanOrEqual(cfg.personality.max);
    expect(talkFactor(extreme(0), cfg)).toBeGreaterThanOrEqual(cfg.personality.min);
    expect(mobileDailyCap('normal', extreme(0), cfg)).toBeGreaterThanOrEqual(1);
  });

  it('respeta la espera entre frases, y volver tras una ausencia la salta', () => {
    const spoke = { lastSpokenAt: { desktop: NOW - 6 * MIN } };
    const tooSoon = maySpeak(input({ state: spoke }), cfg);
    expect(tooSoon).toMatchObject({ ok: false, reason: 'too_soon' });
    expect((tooSoon as any).retryInMs).toBeGreaterThan(10 * MIN);
    expect(maySpeak(input({ state: spoke, back: true }), cfg).ok).toBe(true);
    expect(maySpeak(input({ state: { lastSpokenAt: { desktop: NOW - 25 * MIN } } }), cfg).ok).toBe(true);
    // Aunque acabe de volver, no dos saludos seguidos
    expect(maySpeak(input({ state: { lastSpokenAt: { desktop: NOW - MIN } }, back: true }), cfg)).toMatchObject({ ok: false, reason: 'too_soon' });
  });

  it('no habla dormido, ni si su entrenador está concentrado, ni de noche', () => {
    expect(maySpeak(input({ asleep: true }), cfg)).toMatchObject({ ok: false, reason: 'asleep' });
    expect(maySpeak(input({ focus: true, back: true }), cfg)).toMatchObject({ ok: false, reason: 'focus' });
    expect(maySpeak(input({ localHour: 2 }), cfg)).toMatchObject({ ok: false, reason: 'quiet_hours' });
    expect(inQuietHours(23, cfg.quietHours)).toBe(true);
    expect(inQuietHours(8, cfg.quietHours)).toBe(false);
    expect(inQuietHours(12, { from: 9, to: 9 })).toBe(false);
  });

  it('en el móvil hay un tope diario, que se reinicia al cambiar de día', () => {
    const cap = mobileDailyCap('normal', neutralDims(), cfg);
    const full = { day: '2026-11-19', mobileCount: cap };
    expect(maySpeak(input({ channel: 'mobile', state: full }), cfg)).toMatchObject({ ok: false, reason: 'daily_cap' });
    expect(maySpeak(input({ channel: 'mobile', state: full, localDay: '2026-11-20' }), cfg).ok).toBe(true);
    // El tope del móvil no frena al escritorio
    expect(maySpeak(input({ channel: 'desktop', state: full }), cfg).ok).toBe(true);
  });

  it('el nivel más callado solo habla cuando su entrenador vuelve', () => {
    expect(maySpeak(input({ level: 'quiet' }), cfg)).toMatchObject({ ok: false, reason: 'only_on_return' });
    expect(maySpeak(input({ level: 'quiet', back: true }), cfg).ok).toBe(true);
    const r = takeInitiative(PHRASES, input({ level: 'quiet', back: true }), ctx(['back', 'hungry']), cfg);
    expect(r.phrase?.kind).toBe('return');
  });

  it('se saluda una vez por ausencia, no cada vez que el cliente dice que ha vuelto', () => {
    expect(shouldGreetReturn(true, {}, NOW, cfg)).toBe(true);
    expect(shouldGreetReturn(false, {}, NOW, cfg)).toBe(false);
    expect(shouldGreetReturn(true, { lastReturnAt: NOW - 5 * MIN }, NOW, cfg)).toBe(false);
    expect(shouldGreetReturn(true, { lastReturnAt: NOW - (cfg.backAfterMinutes + 1) * MIN }, NOW, cfg)).toBe(true);
  });
});

describe('iniciativa: qué dice', () => {
  it('al volver, lo primero es la bienvenida', () => {
    const r = takeInitiative(PHRASES, input({ back: true }), ctx(['back', 'hungry', 'morning']), cfg);
    expect(r.phrase?.kind).toBe('return');
    expect(r.state.lastReturnAt).toBe(NOW);
    expect(r.state.lastSpokenAt?.desktop).toBe(NOW);
    expect(r.state.recent).toEqual([r.phrase!.id]);
  });

  it('sin vuelta, manda lo que necesita antes que la charla', () => {
    const r = takeInitiative(PHRASES, input(), ctx(['hungry']), cfg);
    expect(r.phrase?.id).toBe('need_hungry');
  });

  it('una bienvenida no se dice si no ha vuelto, aunque la señal llegue por error', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = takeInitiative(PHRASES, input(), { ...ctx(['back']), rng: createRng(seed) }, cfg);
      expect(r.phrase?.kind).not.toBe('return');
    }
  });

  it('usa lo que sabe de su entrenador cuando lo sabe', () => {
    const vars = { 'tipo.mascota.real': 'perro', 'nombre.mascota.real': 'Toby' };
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const r = takeInitiative(PHRASES, input(), { ...ctx(['morning'], vars), rng: createRng(seed) }, cfg);
      if (r.phrase) seen.add(r.phrase.id);
    }
    expect([...seen].some((id) => id.startsWith('care_real_pet'))).toBe(true);
    // Sin esos datos, esas frases no salen nunca
    for (let seed = 1; seed <= 200; seed++) {
      const r = takeInitiative(PHRASES, input(), { ...ctx(['morning']), rng: createRng(seed) }, cfg);
      expect(r.phrase?.id.startsWith('care_real_pet')).not.toBe(true);
    }
  });

  it('una conversación de un día: no agobia, no se repite y nunca deja huecos', () => {
    let state = {};
    const said: string[] = [];
    // Una petición por minuto durante ocho horas, con hambre a media mañana
    for (let minute = 0; minute < 8 * 60; minute++) {
      const now = NOW + minute * MIN;
      const flags = ['morning', ...(minute > 120 && minute < 200 ? ['hungry'] : [])];
      const r = takeInitiative(PHRASES, input({ state, now, localHour: 10 + Math.floor(minute / 60) }), { ...ctx(flags), rng: createRng(minute + 1) }, cfg);
      state = r.state;
      if (r.phrase) {
        said.push(r.phrase.id);
        expect(r.phrase.text).not.toMatch(/\{|\}|undefined|null/);
      } else {
        expect(r.retryInMs).toBeGreaterThanOrEqual(MIN);
      }
    }
    // Con el nivel normal: como mucho una frase cada 20 minutos
    expect(said.length).toBeLessThanOrEqual(Math.ceil((8 * 60) / cfg.levels.normal.desktopMinutes));
    expect(said.length).toBeGreaterThan(5);
    for (let i = 1; i < said.length; i++) expect(said[i]).not.toBe(said[i - 1]);
    expect(said).toContain('need_hungry');
  });

  it('si calla, no cambia nada guardado', () => {
    const state = { lastSpokenAt: { desktop: NOW - MIN }, recent: ['idle_here'], lastAt: { idle_here: NOW - MIN } };
    const r = takeInitiative(PHRASES, input({ state }), ctx(), cfg);
    expect(r.phrase).toBeNull();
    expect(r.reason).toBe('too_soon');
    expect(r.state).toEqual(normalizeInitiative(state));
  });

  it('es determinista y tolera un estado corrupto', () => {
    const run = () => takeInitiative(PHRASES, input(), ctx(['morning']), cfg);
    expect(run()).toEqual(run());
    expect(normalizeInitiative({ level: 'gritón', lastAt: { 'x y': 1, ok_id: 'no', bien: 5 }, recent: [1, 'a'], mobileCount: 'tres' })).toEqual({
      lastSpokenAt: {},
      lastAt: { bien: 5 },
      recent: ['a'],
      mobileCount: 0,
    });
    expect(takeInitiative(PHRASES, input({ state: 'basura' as any }), ctx(), cfg).phrase).not.toBeNull();
  });
});
