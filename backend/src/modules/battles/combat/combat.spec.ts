import * as fs from 'fs';
import * as path from 'path';
import { simulateBattle, elementMultiplier } from './engine';
import { createRng, hashSeed } from './rng';
import { generateBot } from './bots';
import { applyElo, expectedScore, isoWeekKey, leagueFor, pickOpponent } from './ranking';
import {
  effectiveStats,
  equippedSkills,
  moodMultiplier,
  unlockedSkills,
  validateAllocation,
  validateEquip,
} from './stats';
import { CombatConfig, Element, Fighter, SkillDef, Strategy } from './types';

const dataDir = path.resolve(__dirname, '../../../../../shared/game-data');
const balance = JSON.parse(fs.readFileSync(path.join(dataDir, 'balance.json'), 'utf8'));
const skills: SkillDef[] = JSON.parse(fs.readFileSync(path.join(dataDir, 'skills.json'), 'utf8'));
const species = JSON.parse(fs.readFileSync(path.join(dataDir, 'species.json'), 'utf8'));
const cfg: CombatConfig = balance.combats;

const SP: Record<Element, any> = {
  fire: species.find((s: any) => s.element === 'fire'),
  water: species.find((s: any) => s.element === 'water'),
  plant: species.find((s: any) => s.element === 'plant'),
} as any;

function fighter(
  element: Element,
  o: { level?: number; strategy?: Strategy; allocated?: Record<string, number>; happiness?: number; health?: number; skillIds?: string[]; name?: string } = {},
): Fighter {
  const level = o.level ?? 10;
  const sp = SP[element];
  const pet = {
    level,
    combatStats: { ...sp.baseStats, allocated: o.allocated ?? {} },
    skills: o.skillIds ?? [],
  };
  return {
    name: o.name ?? `${element}-${level}`,
    speciesId: sp.id,
    element,
    level,
    stats: effectiveStats(pet),
    mood: moodMultiplier({ happiness: o.happiness ?? 100, health: o.health ?? 100 }, cfg),
    skills: equippedSkills(pet, element, skills),
    strategy: o.strategy ?? 'balanced',
    isBot: false,
  };
}

const winRate = (a: Fighter, b: Fighter, n = 400) => {
  let wins = 0;
  let draws = 0;
  for (let i = 1; i <= n; i++) {
    const r = simulateBattle(a, b, i * 7919, cfg);
    if (r.winner === 0) wins++;
    else if (r.winner === null) draws++;
  }
  return (wins + draws / 2) / n;
};

describe('motor de combate', () => {
  describe('determinismo', () => {
    it('la misma semilla y los mismos luchadores producen exactamente el mismo registro', () => {
      const a = fighter('fire', { level: 12 });
      const b = fighter('water', { level: 12 });
      const r1 = simulateBattle(a, b, 123456, cfg);
      const r2 = simulateBattle(a, b, 123456, cfg);
      expect(JSON.stringify(r1.log)).toBe(JSON.stringify(r2.log));
      expect(r1.winner).toBe(r2.winner);
    });

    it('semillas distintas dan combates distintos', () => {
      const a = fighter('fire');
      const b = fighter('plant');
      const logs = new Set(Array.from({ length: 20 }, (_, i) => JSON.stringify(simulateBattle(a, b, i + 1, cfg).log.events)));
      expect(logs.size).toBeGreaterThan(10);
    });

    it('no muta a los luchadores y el registro sobrevive a JSON (repetición)', () => {
      const a = fighter('water');
      const b = fighter('fire');
      const snapshot = JSON.stringify([a, b]);
      const r = simulateBattle(a, b, 99, cfg);
      expect(JSON.stringify([a, b])).toBe(snapshot);
      expect(JSON.parse(JSON.stringify(r.log))).toEqual(r.log);
      expect(r.log.version).toBe(1);
      expect(r.log.seed).toBe(99);
    });

    it('el combate no usa Math.random ni la fecha', () => {
      const spyRandom = jest.spyOn(Math, 'random');
      const spyNow = jest.spyOn(Date, 'now');
      simulateBattle(fighter('fire'), fighter('plant'), 5, cfg);
      expect(spyRandom).not.toHaveBeenCalled();
      expect(spyNow).not.toHaveBeenCalled();
      spyRandom.mockRestore();
      spyNow.mockRestore();
    });
  });

  describe('invariantes', () => {
    it('en 300 combates: la vida nunca se sale de rango, termina con "end" y el ganador es coherente', () => {
      const elements: Element[] = ['fire', 'water', 'plant'];
      const strategies: Strategy[] = ['aggressive', 'defensive', 'balanced'];
      for (let i = 0; i < 300; i++) {
        const a = fighter(elements[i % 3], { level: 1 + (i % 40), strategy: strategies[i % 3] });
        const b = fighter(elements[(i + 1) % 3], { level: 1 + ((i * 7) % 40), strategy: strategies[(i + 1) % 3] });
        const r = simulateBattle(a, b, i + 1000, cfg);
        const [p0, p1] = r.log.participants;
        for (const ev of r.log.events) {
          const hp = (ev as any).hp as [number, number] | undefined;
          if (hp) {
            expect(hp[0]).toBeGreaterThanOrEqual(0);
            expect(hp[0]).toBeLessThanOrEqual(p0.maxHp);
            expect(hp[1]).toBeGreaterThanOrEqual(0);
            expect(hp[1]).toBeLessThanOrEqual(p1.maxHp);
          }
        }
        const last = r.log.events[r.log.events.length - 1];
        expect(last.t).toBe('end');
        expect(r.rounds).toBeLessThanOrEqual(cfg.maxRounds);
        if (r.winner === 0) expect(r.finalHp[0]).toBeGreaterThan(0);
        if (r.winner === 1) expect(r.finalHp[1]).toBeGreaterThan(0);
        if ((last as any).reason === 'faint' && r.winner !== null) expect(r.finalHp[1 - r.winner]).toBe(0);
      }
    });

    it('la duración es razonable en todos los niveles (3–20 rondas de media)', () => {
      for (const level of [1, 10, 25, 50]) {
        let total = 0;
        const n = 60;
        for (let i = 1; i <= n; i++) {
          total += simulateBattle(fighter('fire', { level }), fighter('water', { level }), i * 31, cfg).rounds;
        }
        const avg = total / n;
        expect(avg).toBeGreaterThanOrEqual(3);
        expect(avg).toBeLessThanOrEqual(20);
      }
    });

    it('el límite de rondas decide por porcentaje de vida', () => {
      const short = { ...cfg, maxRounds: 1 };
      const r = simulateBattle(fighter('fire', { level: 10 }), fighter('fire', { level: 10 }), 7, short);
      expect(r.rounds).toBe(1);
      const end: any = r.log.events[r.log.events.length - 1];
      expect(end.reason).toBe('rounds');
      const pct = (i: 0 | 1) => r.finalHp[i] / r.log.participants[i].maxHp;
      expect(r.winner).toBe(pct(0) > pct(1) ? 0 : pct(0) < pct(1) ? 1 : null);
    });
  });

  describe('balance', () => {
    it('la tabla de afinidades se cumple (ventaja ×1.5, desventaja ×0.67, neutro ×1)', () => {
      expect(elementMultiplier('fire', 'plant', cfg)).toBe(1.5);
      expect(elementMultiplier('plant', 'fire', cfg)).toBe(0.67);
      expect(elementMultiplier('water', 'fire', cfg)).toBe(1.5);
      expect(elementMultiplier('plant', 'water', cfg)).toBe(1.5);
      expect(elementMultiplier('electric', 'water', cfg)).toBe(1.5);
      expect(elementMultiplier('electric', 'plant', cfg)).toBe(0.67);
      expect(elementMultiplier('shadow', 'light', cfg)).toBe(1.5);
      expect(elementMultiplier('light', 'shadow', cfg)).toBe(1.5);
      expect(elementMultiplier('fire', 'fire', cfg)).toBe(1);
      expect(elementMultiplier('neutral', 'plant', cfg)).toBe(1);
    });

    it('la ventaja elemental importa: fuego gana a planta y pierde contra agua', () => {
      expect(winRate(fighter('fire'), fighter('plant'))).toBeGreaterThan(0.65);
      expect(winRate(fighter('fire'), fighter('water'))).toBeLessThan(0.35);
      expect(winRate(fighter('water'), fighter('plant'))).toBeLessThan(0.35);
    });

    it('un espejo es justo (45–55 %) con la misma estrategia', () => {
      const rate = winRate(fighter('fire', { name: 'A' }), fighter('fire', { name: 'B' }), 800);
      expect(rate).toBeGreaterThan(0.42);
      expect(rate).toBeLessThan(0.58);
    });

    it('el nivel domina: nivel 20 gana casi siempre a nivel 10', () => {
      expect(winRate(fighter('fire', { level: 20 }), fighter('fire', { level: 10 }), 200)).toBeGreaterThan(0.9);
    });

    it('repartir puntos de stat mejora el rendimiento', () => {
      const boosted = fighter('fire', { level: 10, allocated: { atk: 14, esp: 14 } });
      expect(winRate(boosted, fighter('fire', { level: 10 }))).toBeGreaterThan(0.6);
    });

    it('el cuidado importa: una mascota descuidada rinde peor que una sana', () => {
      const neglected = fighter('fire', { happiness: 0, health: 0 });
      expect(neglected.mood).toBeCloseTo(0.8, 5);
      expect(winRate(neglected, fighter('fire'))).toBeLessThan(0.4);
    });
  });

  describe('habilidades y estados', () => {
    const run = (a: Fighter, b: Fighter, seeds = 60) => Array.from({ length: seeds }, (_, i) => simulateBattle(a, b, i + 1, cfg));

    it('respeta los enfriamientos: una habilidad de enfriamiento 2 no se repite antes de 3 rondas', () => {
      const a = fighter('fire', { level: 15, skillIds: ['power_slam', 'tackle'] });
      const b = fighter('fire', { level: 15, skillIds: ['tackle'] });
      for (const r of run(a, b, 40)) {
        let round = 0;
        const used: number[] = [];
        for (const ev of r.log.events) {
          if (ev.t === 'round') round = ev.n;
          if (ev.t === 'move' && ev.actor === 0 && ev.skill === 'power_slam') used.push(round);
        }
        for (let i = 1; i < used.length; i++) expect(used[i] - used[i - 1]).toBeGreaterThanOrEqual(3);
      }
    });

    it('la prioridad adelanta al más lento: Golpe Veloz actúa primero', () => {
      const slow = { ...fighter('fire', { level: 10, skillIds: ['swift_strike'] }) };
      slow.stats = { ...slow.stats, vel: 1 };
      const fast = fighter('water', { level: 10, skillIds: ['tackle'] });
      fast.stats = { ...fast.stats, vel: 500 };
      const r = simulateBattle(slow, fast, 3, cfg);
      const firstMove = r.log.events.find((e) => e.t === 'move') as any;
      expect(firstMove.actor).toBe(0);
    });

    it('la velocidad decide el orden con igual prioridad', () => {
      const a = fighter('fire', { skillIds: ['tackle'] });
      const b = fighter('fire', { skillIds: ['tackle'] });
      a.stats = { ...a.stats, vel: 300 };
      b.stats = { ...b.stats, vel: 10 };
      const r = simulateBattle(a, b, 11, cfg);
      expect((r.log.events.find((e) => e.t === 'move') as any).actor).toBe(0);
    });

    it('la quemadura inflige daño por turno y caduca', () => {
      const a = fighter('fire', { level: 12, skillIds: ['flame_burst', 'ember'] });
      const b = fighter('fire', { level: 12, skillIds: ['tackle'] });
      let sawDot = false;
      for (const r of run(a, b, 80)) {
        const burn = r.log.events.filter((e) => e.t === 'dot');
        if (burn.length > 0) {
          sawDot = true;
          const maxHp = r.log.participants[1].maxHp;
          for (const e of burn as any[]) expect(e.damage).toBe(Math.max(1, Math.round(maxHp * cfg.burnPctPerTurn)));
        }
      }
      expect(sawDot).toBe(true);
    });

    it('curar nunca supera la vida máxima y la IA defensiva se cura con poca vida', () => {
      const a = fighter('plant', { level: 20, strategy: 'defensive', skillIds: ['recover', 'tackle', 'guard'] });
      const b = fighter('fire', { level: 20, strategy: 'aggressive' });
      let healed = 0;
      for (const r of run(a, b, 60)) {
        for (const e of r.log.events) {
          if (e.t === 'heal') {
            healed++;
            expect(e.hp[e.actor]).toBeLessThanOrEqual(r.log.participants[e.actor].maxHp);
            expect(e.amount).toBeGreaterThan(0);
          }
        }
      }
      expect(healed).toBeGreaterThan(0);
    });

    it('la estrategia cambia el comportamiento (agresiva no usa Guardia, defensiva sí)', () => {
      const loadout = ['guard', 'tackle', 'ember'];
      const count = (strategy: Strategy) => {
        let guards = 0;
        for (let i = 1; i <= 40; i++) {
          const r = simulateBattle(fighter('fire', { level: 10, strategy, skillIds: loadout }), fighter('water', { level: 10 }), i, cfg);
          guards += r.log.events.filter((e) => e.t === 'guard' && e.actor === 0).length;
        }
        return guards;
      };
      expect(count('aggressive')).toBe(0);
      expect(count('defensive')).toBeGreaterThan(0);
    });

    it('si todo está en enfriamiento sigue atacando (nunca se queda sin acción)', () => {
      const a = fighter('fire', { level: 15, skillIds: ['power_slam'] });
      const r = simulateBattle(a, fighter('plant', { level: 15 }), 21, cfg);
      const mine = r.log.events.filter((e) => e.t === 'move' && e.actor === 0);
      expect(mine.length).toBeGreaterThanOrEqual(r.rounds - 1);
    });
  });

  describe('estadísticas y habilidades', () => {
    it('effectiveStats sigue la fórmula del diseño', () => {
      const s = effectiveStats({ level: 10, combatStats: { hp: 50, atk: 60, def: 40, vel: 30, esp: 20, allocated: { atk: 7 } } });
      expect(s).toEqual({ hp: 75, atk: 97, def: 60, vel: 45, esp: 30 });
    });

    it('moodMultiplier: 1.0 con cuidado máximo, 0.8 sin cuidado y penaliza estar enfermo', () => {
      expect(moodMultiplier({ happiness: 100, health: 100 }, cfg)).toBe(1);
      expect(moodMultiplier({ happiness: 0, health: 0 }, cfg)).toBe(0.8);
      expect(moodMultiplier({ happiness: 100, health: 100, sick: true }, cfg)).toBe(0.9);
      expect(moodMultiplier({ happiness: 500, health: -5 }, cfg)).toBeGreaterThanOrEqual(0.8);
    });

    it('las habilidades se desbloquean por nivel y elemento', () => {
      const ids = (lvl: number, el: Element) => unlockedSkills(skills, el, lvl).map((s) => s.id);
      expect(ids(1, 'fire')).toEqual(expect.arrayContaining(['tackle', 'ember']));
      expect(ids(1, 'fire')).not.toContain('flame_burst');
      expect(ids(10, 'fire')).toContain('flame_burst');
      expect(ids(25, 'water')).toEqual(expect.arrayContaining(['tsunami', 'recover']));
      expect(ids(25, 'water')).not.toContain('inferno');
    });

    it('el equipamiento por defecto incluye un ataque y tiene como máximo 4 habilidades', () => {
      const loadout = equippedSkills({ level: 30, skills: [] }, 'fire', skills);
      expect(loadout.length).toBeLessThanOrEqual(4);
      expect(loadout.some((s) => s.kind === 'attack')).toBe(true);
      expect(loadout.map((s) => s.id)).toContain('tackle');
    });

    it('un equipamiento guardado se respeta pero se descartan habilidades ya no válidas', () => {
      const chosen = equippedSkills({ level: 5, skills: ['ember', 'inferno', 'vine_whip', 'swift_strike'] }, 'fire', skills);
      expect(chosen.map((s) => s.id)).toEqual(['ember', 'swift_strike']);
    });

    it('validateAllocation exige enteros, estadísticas válidas y puntos suficientes', () => {
      expect(validateAllocation({ atk: 3, hp: 2 }, 5)).toMatchObject({ ok: true, total: 5 });
      for (const bad of [{ atk: 3 }, { atk: -1 }, { atk: 1.5 }, { speed: 1 }, {}, null, [], { atk: '3' }, { atk: 2000 }]) {
        expect(validateAllocation(bad, 2).ok).toBe(false);
      }
    });

    it('validateEquip: ≤4, sin repetidos, desbloqueadas, del elemento y con al menos un ataque', () => {
      const ok = (ids: unknown, el: Element = 'fire', lvl = 15) => validateEquip(ids, el, lvl, skills);
      expect(ok(['tackle', 'ember', 'guard', 'recover'])).toMatchObject({ ok: true });
      expect(ok([]).ok).toBe(false);
      expect(ok(['tackle', 'ember', 'guard', 'recover', 'power_slam']).ok).toBe(false);
      expect(ok(['tackle', 'tackle']).ok).toBe(false);
      expect(ok(['bubble']).ok).toBe(false); // de otro elemento
      expect(ok(['inferno']).ok).toBe(false); // nivel insuficiente
      expect(ok(['nope']).ok).toBe(false);
      expect(ok(['guard', 'recover']).ok).toBe(false); // sin ataque
      expect(ok('tackle').ok).toBe(false);
      expect(ok([7]).ok).toBe(false);
    });
  });

  describe('bots', () => {
    it('son deterministas por semilla y válidos', () => {
      const a = generateBot(42, 10, species, skills, cfg);
      const b = generateBot(42, 10, species, skills, cfg);
      expect(a).toEqual(b);
      expect(a.isBot).toBe(true);
      expect(a.name).toContain('Fantasma de');
      expect(a.level).toBeGreaterThanOrEqual(9);
      expect(a.level).toBeLessThanOrEqual(11);
      expect(a.skills.length).toBeGreaterThan(0);
      expect(a.skills.length).toBeLessThanOrEqual(4);
      expect(a.skills.every((s) => s.element === 'neutral' || s.element === a.element)).toBe(true);
      const levels = new Set(Array.from({ length: 60 }, (_, i) => generateBot(i, 10, species, skills, cfg).level));
      expect(levels.size).toBe(3);
      const species2 = new Set(Array.from({ length: 60 }, (_, i) => generateBot(i, 10, species, skills, cfg).speciesId));
      expect(species2.size).toBe(3);
    });

    it('nunca baja del nivel 1 y es un rival justo frente a un jugador del mismo nivel', () => {
      expect(generateBot(1, 1, species, skills, cfg).level).toBeGreaterThanOrEqual(1);
      let wins = 0;
      const n = 150;
      for (let i = 0; i < n; i++) {
        const bot = generateBot(i + 5, 10, species, skills, cfg);
        const me = fighter(bot.element === 'fire' ? 'plant' : 'fire', { level: 10 });
        if (simulateBattle(me, bot, i, cfg).winner === 0) wins++;
      }
      expect(wins / n).toBeGreaterThan(0.2);
      expect(wins / n).toBeLessThan(0.8);
    });
  });

  describe('rng', () => {
    it('createRng es reproducible y hashSeed estable', () => {
      const a = createRng(5);
      const b = createRng(5);
      expect([a(), a(), a()]).toEqual([b(), b(), b()]);
      expect(hashSeed('abc')).toBe(hashSeed('abc'));
      expect(hashSeed('abc')).not.toBe(hashSeed('abd'));
    });
  });
});

describe('ranking', () => {
  const elo = balance.combats.elo;

  it('el ELO es de suma cero y premia más la sorpresa', () => {
    const even = applyElo(1000, 1000, 1, elo);
    expect(even).toMatchObject({ deltaA: 16, deltaB: -16, newA: 1016, newB: 984 });
    const upset = applyElo(1000, 1400, 1, elo);
    const expected = applyElo(1400, 1000, 1, elo);
    expect(upset.deltaA).toBeGreaterThan(even.deltaA);
    expect(expected.deltaA).toBeLessThan(even.deltaA);
    for (const [a, b, s] of [[1000, 1200, 1], [1500, 1100, 0], [900, 900, 0.5], [2000, 800, 0]] as const) {
      const r = applyElo(a, b, s, elo);
      expect(r.deltaA + r.deltaB).toBe(0);
    }
    expect(applyElo(1000, 1000, 0.5, elo).deltaA).toBe(0);
  });

  it('el ELO no baja del suelo', () => {
    const r = applyElo(10, 10, 0, { k: 32, floor: 0 });
    expect(r.newA).toBe(0);
    expect(r.deltaA).toBe(-10);
    expect(expectedScore(1000, 1000)).toBe(0.5);
  });

  it('leagueFor devuelve la liga, la siguiente y los puntos que faltan', () => {
    const leagues = balance.combats.leagues;
    expect(leagueFor(1000, leagues)).toMatchObject({ id: 'bronze', toNext: 100, next: { id: 'silver' } });
    expect(leagueFor(1100, leagues).id).toBe('silver');
    expect(leagueFor(1899, leagues).id).toBe('diamond');
    expect(leagueFor(5000, leagues)).toMatchObject({ id: 'mythic', next: null, toNext: null });
    expect(leagueFor(0, leagues).id).toBe('bronze');
  });

  describe('pickOpponent', () => {
    const cands = [
      { petId: 'a', elo: 1010 },
      { petId: 'b', elo: 1090 },
      { petId: 'c', elo: 1300 },
      { petId: 'd', elo: 2500 },
    ];
    it('elige dentro de la ventana inicial y entre los más cercanos', () => {
      const r = pickOpponent(cands, 1000, elo, () => 0);
      expect(r?.petId).toBe('a');
      expect(pickOpponent(cands, 1000, elo, () => 0.99)?.petId).toBe('b');
    });
    it('amplía la ventana por pasos y nunca supera la máxima', () => {
      expect(pickOpponent([{ petId: 'c', elo: 1300 }], 1000, elo, () => 0)?.petId).toBe('c');
      expect(pickOpponent([{ petId: 'x', elo: 1401 }], 1000, elo, () => 0)).toBeNull();
      expect(pickOpponent([], 1000, elo, () => 0)).toBeNull();
    });
    it('es determinista con el mismo azar', () => {
      const rng1 = createRng(9);
      const rng2 = createRng(9);
      expect(pickOpponent(cands, 1000, elo, rng1)).toEqual(pickOpponent(cands, 1000, elo, rng2));
    });
  });

  it('isoWeekKey calcula la semana ISO en UTC', () => {
    expect(isoWeekKey(new Date('2026-11-13T12:00:00Z'))).toBe('2026-W46');
    expect(isoWeekKey(new Date('2026-01-01T00:00:00Z'))).toBe('2026-W01');
    expect(isoWeekKey(new Date('2025-12-29T00:00:00Z'))).toBe('2026-W01');
    expect(isoWeekKey(new Date('2027-01-03T23:59:59Z'))).toBe('2026-W53');
    expect(isoWeekKey(new Date('2026-11-16T00:00:00Z'))).toBe('2026-W47');
  });
});
