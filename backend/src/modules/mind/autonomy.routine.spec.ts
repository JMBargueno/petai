import * as fs from 'fs';
import * as path from 'path';
import { intervalIndex, intervalStart, simulate, type SimInput } from './autonomy.engine';
import { dayKey } from './evolution.engine';
import type { AutonomyConfig } from './mind.types';
import { neutralDims } from './personality.engine';

const balance = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../shared/game-data/balance.json'), 'utf8'));
const cfg = balance.personality.autonomy as AutonomyConfig;
/** Todo se recuerda y nada se recorta: así cada hora deja ver qué hizo. */
const loud: AutonomyConfig = { ...cfg, memorableChance: 1, maxEpisodesPerCatchUp: 10_000 };
const quietRoutine: AutonomyConfig = { ...loud, routine: undefined };

const START = intervalIndex(new Date('2026-11-16T00:00:00Z'), cfg);
/** Reloj en UTC: la hora local coincide con la del intervalo. */
const clock = (index: number) => {
  const at = intervalStart(index, cfg);
  return { hour: at.getUTCHours(), day: dayKey(at) };
};
const base = (o: Partial<SimInput> = {}): SimInput => ({
  petId: 'pet-rutina',
  dims: neutralDims(),
  inHabitat: false,
  sleeping: false,
  sick: false,
  energy: 100,
  from: START,
  to: START + 24 * 14 - 1,
  friends: [],
  daily: undefined,
  clock,
  ...o,
});

/** Actividad de cada hora, sin rutina de episodios: se simula hora a hora encadenando el hilo. */
function hourly(input: SimInput, c: AutonomyConfig): { index: number; activity: string }[] {
  const out: { index: number; activity: string }[] = [];
  let routine: unknown = input.routine;
  let daily = input.daily;
  for (let i = input.from; i <= input.to; i++) {
    // Sin recuerdos repetidos no se ve la actividad: se le pide con la rutina de episodios apagada
    const r = simulate({ ...input, from: i, to: i, routine, daily, energy: 100 }, { ...c, routine: c.routine ? { ...c.routine, longFrom: 10_000 } : undefined }, 'x');
    routine = r.routine;
    daily = r.daily;
    // Con racha el recuerdo normal se calla: la actividad se lee del hilo
    out.push({ index: i, activity: (r.routine?.last ?? r.episodes[0]?.activity) as string });
  }
  return out;
}

describe('vida autónoma — rutinas con continuidad (spec 41, fase F)', () => {
  it('sin reloj no cambia nada: la rutina no se aplica', () => {
    const noClock = base({ clock: undefined, to: START + 200 });
    const a = simulate(noClock, loud, '2026-11-16');
    const b = simulate(noClock, quietRoutine, '2026-11-16');
    expect(a).toEqual(b);
    expect(a.routine).toBeUndefined();
  });

  it('es determinista: la misma tanda da lo mismo', () => {
    expect(simulate(base(), cfg, 'x')).toEqual(simulate(base(), cfg, 'x'));
  });

  it('de noche casi siempre descansa; sin rutina, no distingue', () => {
    const night = (rows: { index: number; activity: string }[]) => rows.filter((r) => clock(r.index).hour < 6);
    const withRoutine = night(hourly(base(), loud));
    const rest = withRoutine.filter((r) => r.activity === 'rest').length / withRoutine.length;
    expect(rest).toBeGreaterThan(0.85);
    expect(withRoutine.filter((r) => r.activity === 'explore').length / withRoutine.length).toBeLessThan(0.05);
  });

  it('de día sigue haciendo de todo', () => {
    const day = hourly(base(), loud).filter((r) => clock(r.index).hour >= 9 && clock(r.index).hour < 19);
    const seen = new Set(day.map((r) => r.activity));
    for (const a of ['rest', 'play_alone', 'explore', 'socialize', 'wait_owner']) expect(seen.has(a)).toBe(true);
  });

  it('lo que hace dura: de día hay menos cambios de actividad que tirando cada hora suelta', () => {
    const daytime = (r: { index: number }) => clock(r.index).hour >= 8 && clock(r.index).hour < 22;
    const switches = (rows: { index: number; activity: string }[]) => {
      let n = 0;
      for (let i = 1; i < rows.length; i++) if (rows[i].index === rows[i - 1].index + 1 && rows[i].activity !== rows[i - 1].activity) n++;
      return n;
    };
    const withRoutine = hourly(base(), loud).filter(daytime);
    // Sin hilo: mismos momentos del día, sin inercia ni encadenamientos
    const noThread = hourly(base(), { ...loud, routine: { ...loud.routine!, momentum: { ...loud.routine!.momentum, stay: 1, tired: 1 }, after: {} } }).filter(daytime);
    expect(switches(withRoutine)).toBeLessThan(switches(noThread) * 0.9);
  });

  it('un buen rato seguido se cuenta una vez, no una por hora', () => {
    const r = simulate(base(), loud, 'x');
    const long = r.episodes.filter((e) => e.content.startsWith('Me pasé') || e.content.includes('un buen rato') || e.content.includes('mucho rato') || e.content.includes('horas ensayando'));
    expect(long.length).toBeGreaterThan(0);
    // Nunca dos recuerdos seguidos de la misma actividad en horas consecutivas
    const plain = r.episodes.filter((e) => !e.itemId && !e.friend);
    for (let i = 1; i < plain.length; i++) {
      if (plain[i].index === plain[i - 1].index + 1) expect(plain[i].activity === plain[i - 1].activity && !long.includes(plain[i])).toBe(false);
    }
  });

  it('retoma el hilo donde lo dejó y lo suelta si ha pasado tiempo', () => {
    const first = simulate(base({ to: START + 13 }), cfg, 'x');
    expect(first.routine).toMatchObject({ index: START + 13 });
    const whole = simulate(base({ to: START + 40 }), loud, 'x');
    const second = simulate(base({ from: START + 14, to: START + 40, routine: first.routine, daily: first.daily }), loud, 'x');
    expect(second.routine).toEqual(whole.routine);
    // Con un hueco de por medio el hilo no cuenta
    const gap = simulate(base({ from: START + 20, to: START + 20, routine: first.routine }), cfg, 'x');
    expect(gap.routine!.streak).toBe(1);
  });

  it('los topes diarios se cuentan en el día de cada hora, no en el de la lectura', () => {
    // Dos días enteros de una vez: sin reloj todo se carga a «hoy» y el tope se agota una sola vez
    const twoDays = base({ to: START + 47, dims: { ...neutralDims(), temper: 90 } });
    const old = simulate({ ...twoDays, clock: undefined }, quietRoutine, dayKey(intervalStart(START + 47, cfg)));
    const now = simulate(twoDays, quietRoutine, dayKey(intervalStart(START + 47, cfg)));
    expect(old.happinessDelta).toBeLessThanOrEqual(cfg.dailyHappinessCap);
    expect(now.happinessDelta).toBeGreaterThan(old.happinessDelta);
    expect(now.happinessDelta).toBeLessThanOrEqual(cfg.dailyHappinessCap * 2);
    expect(now.daily.day).toBe(dayKey(intervalStart(START + 47, cfg)));
  });

  it('una hora de ayer no gasta ni borra los contadores de hoy', () => {
    const today = dayKey(intervalStart(START + 30, cfg));
    const already = { day: today, items: 1, happiness: 5, energy: 3, encounters: 2 };
    const r = simulate(base({ from: START + 20, to: START + 23, daily: already }), quietRoutine, 'x');
    expect(r.daily).toEqual(already);
  });

  it('dormido o enfermo manda sobre la rutina', () => {
    const asleep = simulate(base({ sleeping: true, to: START + 30 }), loud, 'x');
    expect(asleep.episodes.every((e) => e.activity === 'sleep')).toBe(true);
    const sick = hourly(base({ sick: true, to: START + 30 }), loud);
    expect(sick.every((r) => r.activity === 'rest')).toBe(true);
  });
});
