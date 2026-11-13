import { createRng } from './rng';
import {
  BattleEvent,
  BattleLog,
  BattleResult,
  CombatConfig,
  Element,
  Fighter,
  ParticipantLog,
  SkillDef,
  Stats,
  StatusKind,
  Strategy,
} from './types';
import { LEVEL_STAT_BONUS } from './stats';

/**
 * Motor de combate por turnos, 100 % determinista: no lee el reloj, la base de datos ni
 * `Math.random`. Mismos luchadores + misma semilla ⇒ mismo registro, byte a byte.
 *
 * El orden de las llamadas al PRNG es fijo (precisión → variación → crítico → estado), de modo
 * que cualquier cambio en las reglas cambia la repetición: por eso el registro guarda la
 * instantánea de los luchadores y `version`.
 */

// ---------- Elementos ----------

const ADVANTAGE: Record<Element, Element[]> = {
  fire: ['plant'],
  water: ['fire'],
  plant: ['water', 'electric'],
  electric: ['water'],
  shadow: ['light'],
  light: ['shadow'],
};

/** Multiplicador de daño del elemento de la habilidad contra el elemento del defensor. */
export function elementMultiplier(
  attack: Element | 'neutral',
  defender: Element,
  cfg: Pick<CombatConfig, 'elementAdvantage' | 'elementDisadvantage'>,
): number {
  if (attack === 'neutral') return 1;
  if (ADVANTAGE[attack]?.includes(defender)) return cfg.elementAdvantage;
  if (ADVANTAGE[defender]?.includes(attack)) return cfg.elementDisadvantage;
  return 1;
}

// ---------- Estado del combate ----------

export interface Status {
  kind: StatusKind;
  turns: number;
  value: number;
}

export interface Side {
  idx: 0 | 1;
  f: Fighter;
  maxHp: number;
  hp: number;
  cooldowns: Record<string, number>;
  statuses: Status[];
}

const status = (s: Side, kind: StatusKind) => s.statuses.find((x) => x.kind === kind);

function effStat(s: Side, key: 'atk' | 'def' | 'esp' | 'vel'): number {
  let v = s.f.stats[key] * s.f.mood;
  if (key === 'vel') {
    const slow = status(s, 'slow');
    if (slow) v *= 1 - slow.value;
  }
  return Math.max(1, v);
}

/** Multiplicador de defensa por estados: Guardia sube, Savia (sap) baja. */
function defenseMult(s: Side, cfg: CombatConfig): number {
  let m = 1;
  if (status(s, 'guard')) m *= cfg.guardDefMultiplier;
  const sap = status(s, 'sap');
  if (sap) m *= 1 - sap.value;
  return m;
}

function isAvailable(s: Side, skill: SkillDef): boolean {
  return (s.cooldowns[skill.id] ?? 0) <= 0;
}

// ---------- IA de reglas (sin azar: depende solo del estado) ----------

const STRATEGY = {
  aggressive: { heal: 0.15, guard: -1 },
  balanced: { heal: 0.3, guard: 0.6 },
  defensive: { heal: 0.45, guard: 0.9 },
} as const;

function attackScore(me: Side, foe: Side, skill: SkillDef, cfg: CombatConfig): number {
  let score = skill.power * (skill.accuracy / 100) * elementMultiplier(skill.element, foe.f.element, cfg);
  if (skill.inflicts && !status(foe, skill.inflicts.kind)) score *= 1 + skill.inflicts.chance * 0.5;
  return score;
}

export function chooseSkill(me: Side, foe: Side, cfg: CombatConfig): SkillDef {
  const t = STRATEGY[me.f.strategy as Strategy] ?? STRATEGY.balanced;
  const hpPct = me.hp / me.maxHp;
  let pool = me.f.skills.filter((s) => isAvailable(me, s));

  if (pool.length === 0) {
    // Todo en enfriamiento: se usa el ataque que antes vuelva a estar disponible
    const attacks = me.f.skills.filter((s) => s.kind === 'attack');
    pool = [[...attacks].sort((a, b) => (me.cooldowns[a.id] ?? 0) - (me.cooldowns[b.id] ?? 0) || a.id.localeCompare(b.id))[0]];
  }

  let best: { skill: SkillDef; score: number } | null = null;
  for (const skill of pool) {
    let score = 0;
    if (skill.kind === 'attack') {
      score = attackScore(me, foe, skill, cfg);
    } else if (skill.kind === 'heal') {
      const missing = (me.maxHp - me.hp) / me.maxHp;
      score = hpPct < t.heal && missing >= (skill.healPct ?? 0.3) * 0.6 ? 1000 : -1;
    } else if (skill.kind === 'guard') {
      score = t.guard > 0 && hpPct < t.guard && !status(me, 'guard') ? 500 : -1;
    }
    if (!best || score > best.score || (score === best.score && skill.id < best.skill.id)) best = { skill, score };
  }
  // Si lo único disponible no es útil (p. ej. curar con la vida llena), se ataca
  if (!best || best.score < 0) {
    const attack = me.f.skills.filter((s) => s.kind === 'attack' && isAvailable(me, s))
      .sort((a, b) => attackScore(me, foe, b, cfg) - attackScore(me, foe, a, cfg) || a.id.localeCompare(b.id))[0]
      ?? me.f.skills.find((s) => s.kind === 'attack')!;
    return attack;
  }
  return best.skill;
}

// ---------- Simulación ----------

function participantLog(s: Side): ParticipantLog {
  return {
    name: s.f.name,
    speciesId: s.f.speciesId,
    element: s.f.element,
    level: s.f.level,
    stats: { ...s.f.stats },
    mood: s.f.mood,
    maxHp: s.maxHp,
    skills: s.f.skills.map((k) => k.id),
    strategy: s.f.strategy,
    isBot: s.f.isBot,
    petId: s.f.petId,
  };
}

export function simulateBattle(attacker: Fighter, defender: Fighter, seed: number, cfg: CombatConfig): BattleResult {
  const rng = createRng(seed);
  const mk = (f: Fighter, idx: 0 | 1): Side => {
    const maxHp = Math.max(1, Math.round(f.stats.hp * cfg.hpMultiplier));
    return { idx, f, maxHp, hp: maxHp, cooldowns: {}, statuses: [] };
  };
  const sides: [Side, Side] = [mk(attacker, 0), mk(defender, 1)];
  const events: BattleEvent[] = [];
  const hpPair = (): [number, number] => [sides[0].hp, sides[1].hp];

  const finish = (winner: 0 | 1 | null, reason: 'faint' | 'rounds', rounds: number): BattleResult => {
    events.push({ t: 'end', winner, reason, rounds, hp: hpPair() });
    const log: BattleLog = { version: 1, seed, participants: [participantLog(sides[0]), participantLog(sides[1])], events };
    return { log, winner, rounds, finalHp: hpPair() };
  };

  const inflict = (target: Side, kind: StatusKind, turns: number, value: number) => {
    const existing = status(target, kind);
    if (existing) {
      existing.turns = Math.max(existing.turns, turns);
      existing.value = value;
    } else {
      target.statuses.push({ kind, turns, value });
    }
    events.push({ t: 'status', target: target.idx, kind, turns });
  };

  const act = (me: Side, foe: Side, skill: SkillDef) => {
    if (skill.cooldown > 0) me.cooldowns[skill.id] = skill.cooldown + 1;

    if (skill.kind === 'heal') {
      const amount = Math.min(me.maxHp - me.hp, Math.round(me.maxHp * (skill.healPct ?? 0.3)));
      me.hp += amount;
      events.push({ t: 'heal', actor: me.idx, skill: skill.id, amount, hp: hpPair() });
      return;
    }
    if (skill.kind === 'guard') {
      inflict(me, 'guard', skill.turns ?? 2, cfg.guardDefMultiplier);
      events.pop(); // el evento 'guard' sustituye al genérico 'status'
      events.push({ t: 'guard', actor: me.idx, skill: skill.id, turns: skill.turns ?? 2 });
      return;
    }

    // Ataque: precisión → variación → crítico → estado (orden fijo del PRNG)
    const hit = rng() * 100 < skill.accuracy;
    if (!hit) {
      events.push({ t: 'move', actor: me.idx, skill: skill.id, hit: false, hp: hpPair() });
      return;
    }
    const elemental = skill.element !== 'neutral';
    const attackStat = effStat(me, elemental ? 'esp' : 'atk');
    const defenseStat = effStat(foe, elemental ? 'esp' : 'def') * defenseMult(foe, cfg);
    const ratio = attackStat / (attackStat + defenseStat);
    const mult = elementMultiplier(skill.element, foe.f.element, cfg);
    const variance = 0.9 + 0.2 * rng();
    const crit = rng() < cfg.critChance;
    const base = skill.power * ratio * cfg.damageScale * (1 + LEVEL_STAT_BONUS * me.f.level);
    const damage = Math.max(1, Math.round(base * mult * variance * (crit ? cfg.critMultiplier : 1)));
    foe.hp = Math.max(0, foe.hp - damage);
    events.push({ t: 'move', actor: me.idx, skill: skill.id, hit: true, crit: crit || undefined, mult, damage, hp: hpPair() });

    if (foe.hp > 0 && skill.inflicts && rng() < skill.inflicts.chance) {
      inflict(foe, skill.inflicts.kind, skill.inflicts.turns, skill.inflicts.value);
    }
  };

  for (let round = 1; round <= cfg.maxRounds; round++) {
    events.push({ t: 'round', n: round });

    const choices: [SkillDef, SkillDef] = [chooseSkill(sides[0], sides[1], cfg), chooseSkill(sides[1], sides[0], cfg)];
    const prio = (i: 0 | 1) => choices[i].priority ?? 0;
    let order: [0, 1] | [1, 0];
    if (prio(0) !== prio(1)) order = prio(0) > prio(1) ? [0, 1] : [1, 0];
    else {
      const v0 = effStat(sides[0], 'vel');
      const v1 = effStat(sides[1], 'vel');
      order = v0 !== v1 ? (v0 > v1 ? [0, 1] : [1, 0]) : rng() < 0.5 ? [0, 1] : [1, 0];
    }

    for (const i of order) {
      const me = sides[i];
      const foe = sides[(1 - i) as 0 | 1];
      if (me.hp <= 0) continue;
      act(me, foe, choices[i]);
      if (foe.hp <= 0) {
        events.push({ t: 'faint', actor: foe.idx });
        return finish(me.idx, 'faint', round);
      }
    }

    // Fin de ronda: daño por quemadura, luego se descuentan estados y enfriamientos
    for (const s of sides) {
      const burn = status(s, 'burn');
      if (burn && s.hp > 0) {
        const dmg = Math.max(1, Math.round(s.maxHp * cfg.burnPctPerTurn));
        s.hp = Math.max(0, s.hp - dmg);
        events.push({ t: 'dot', target: s.idx, kind: 'burn', damage: dmg, hp: hpPair() });
      }
    }
    const dead = sides.filter((s) => s.hp <= 0);
    if (dead.length === 2) {
      events.push({ t: 'faint', actor: 0 }, { t: 'faint', actor: 1 });
      return finish(null, 'faint', round);
    }
    if (dead.length === 1) {
      events.push({ t: 'faint', actor: dead[0].idx });
      return finish((1 - dead[0].idx) as 0 | 1, 'faint', round);
    }
    for (const s of sides) {
      s.statuses = s.statuses.map((x) => ({ ...x, turns: x.turns - 1 })).filter((x) => x.turns > 0);
      for (const id of Object.keys(s.cooldowns)) {
        s.cooldowns[id] -= 1;
        if (s.cooldowns[id] <= 0) delete s.cooldowns[id];
      }
    }
  }

  // Límite de rondas: gana quien conserve mayor porcentaje de vida; si empatan, es empate
  const p0 = sides[0].hp / sides[0].maxHp;
  const p1 = sides[1].hp / sides[1].maxHp;
  const winner = Math.abs(p0 - p1) < 1e-9 ? null : p0 > p1 ? 0 : 1;
  return finish(winner, 'rounds', cfg.maxRounds);
}

export type { Stats };
