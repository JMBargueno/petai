/**
 * Vida autónoma (spec 36) — simulación por intervalos, funciones puras.
 *
 * No hay una IA ejecutándose en cada criatura: el tiempo se divide en intervalos fijos
 * (`intervalMinutes`) con índice absoluto (epoch / intervalo). Al leer la mascota se simulan los
 * intervalos pendientes desde su cursor. Cada intervalo usa un PRNG sembrado con (petId, índice):
 * repetir la simulación del mismo intervalo da exactamente el mismo resultado (no se pueden
 * "farmear" objetos releyendo) y el coste es cero en LLM.
 *
 * La personalidad pondera qué hace la criatura: curiosa → explora y encuentra objetos;
 * sociable → busca a otros Pockai; tranquila → descansa en su hábitat; afectuosa → espera al
 * entrenador. Lo memorable se convierte en recuerdos episódicos y en eventos de evolución.
 */
import { advanceRoutine, isLongStretch, normalizeRoutine, phaseOf, routineFactor, type RoutineState } from '@pockai/mind/node';
import { createRng, hashSeed } from '../battles/combat/rng';
import { AutonomyActivity, AutonomyConfig, AutonomyDaily, Dims, ExtraActivity } from './mind.types';
import { text, variants } from './strings';
import { weighted } from './personality.engine';

export const ACTIVITIES: AutonomyActivity[] = ['rest', 'play_alone', 'explore', 'socialize', 'wait_owner'];

/**
 * Actividades de este intervalo: las cinco de siempre y, **al final**, las nuevas que estén en la
 * configuración y vengan a cuento (practicar exige tener un truco por aprender; ordenar, estar en
 * su hábitat). Sin ellas, la elección es idéntica a la de antes: mismo orden, mismas cuentas.
 */
export function activitiesFor(input: SimInput, cfg: AutonomyConfig): AutonomyActivity[] {
  const extras: ExtraActivity[] = [];
  if (cfg.activities.practice_trick && input.canPractice) extras.push('practice_trick');
  if (cfg.activities.tidy_habitat && input.inHabitat) extras.push('tidy_habitat');
  return extras.length ? [...ACTIVITIES, ...extras] : ACTIVITIES;
}

export function intervalIndex(t: Date | number, cfg: AutonomyConfig): number {
  const ms = typeof t === 'number' ? t : t.getTime();
  return Math.floor(ms / (cfg.intervalMinutes * 60_000));
}

export function intervalStart(index: number, cfg: AutonomyConfig): Date {
  return new Date(index * cfg.intervalMinutes * 60_000);
}

export interface Friend {
  petId: string;
  name: string;
  ownerId: string;
  ownerName: string;
  /**
   * Cuánto tira ir a verle (por lo bien que le cae y la etapa de la relación). Sin este dato en
   * ningún amigo, se elige como siempre.
   */
  affinity?: number;
}

export interface SimInput {
  petId: string;
  dims: Dims;
  inHabitat: boolean;
  sleeping: boolean;
  sick: boolean;
  energy: number;
  /** Índices a simular, [from, to] inclusivos. */
  from: number;
  to: number;
  friends: Friend[];
  daily: AutonomyDaily | undefined;
  /** Nombre visible de los objetos encontrables (id → nombre). */
  itemNames?: Record<string, string>;
  /** Le queda algún truco por aprender (habilita practicar). */
  canPractice?: boolean;
  /** Multiplicador de peso por actividad: lo que le apetece (deseos activos) pesa más. */
  boosts?: Readonly<Record<string, number>>;
  /**
   * Hora local de su entrenador (0-23) y día de cada intervalo. Con ella hay rutina (día y noche,
   * hilo entre horas) y los topes diarios se cuentan en el día en que ocurrió cada hora, no en el
   * de la lectura. Sin ella, todo es como antes.
   */
  clock?: (index: number) => { hour: number; day: string };
  /** En qué andaba al acabar la simulación anterior. */
  routine?: unknown;
}

export interface Episode {
  index: number;
  activity: AutonomyActivity | 'sleep';
  content: string;
  importance: number;
  valence: number;
  itemId?: string;
  friend?: Friend;
}

export interface SimResult {
  episodes: Episode[];
  evolutionEvents: string[];
  energyDelta: number;
  happinessDelta: number;
  itemsFound: string[];
  /** Encuentros con mascotas de amigos (para escribir también en la memoria del otro). */
  encounters: { index: number; friend: Friend }[];
  /** Veces que practicó un truco por su cuenta. */
  practices: number;
  daily: AutonomyDaily;
  /** En qué anda al acabar (solo con rutina). */
  routine?: RoutineState;
}

const pick = <T>(arr: T[], r: number): T => arr[Math.floor(r * arr.length) % arr.length];

/** Frases de lo que hizo por su cuenta: `AUTO_<ACTIVIDAD>_<n>` en `shared/game-data/strings`. */
const textsOf = (activity: AutonomyActivity | 'sleep'): string[] => variants(`AUTO_${activity.toUpperCase()}`);

/**
 * A qué amigo va a ver. Si se sabe cuánto tira cada uno, es más probable el que mejor le cae; si
 * no, se elige como siempre. Usa la misma tirada en los dos casos: no consume azar nuevo.
 */
export function pickFriend(friends: Friend[], r: number): Friend {
  if (!friends.some((f) => typeof f.affinity === 'number')) return pick(friends, r);
  const weights = friends.map((f) => Math.max(0.05, f.affinity ?? 1));
  const total = weights.reduce((s, w) => s + w, 0);
  let acc = 0;
  for (let i = 0; i < friends.length; i++) {
    acc += weights[i] / total;
    if (r < acc) return friends[i];
  }
  return friends[friends.length - 1];
}

function chooseActivity(input: SimInput, energy: number, r: number, cfg: AutonomyConfig, routine?: (a: AutonomyActivity) => number): AutonomyActivity {
  if (input.sick || energy < cfg.minEnergyForActivity) return 'rest';
  const list = activitiesFor(input, cfg);
  const weights = list.map((a) => {
    const conf = cfg.activities[a]!;
    let w = weighted(conf.base, conf.weights, input.dims);
    if (a === 'rest' && input.inHabitat) w *= 1.5;
    // Lo que le apetece pesa más (solo si hay deseo: sin él no se toca la cuenta)
    const boost = input.boosts?.[a];
    if (boost !== undefined) w *= boost;
    // El momento del día y lo que venía haciendo inclinan la balanza (solo con rutina)
    if (routine) w *= routine(a);
    return w;
  });
  const total = weights.reduce((s, w) => s + w, 0);
  let acc = 0;
  for (let i = 0; i < list.length; i++) {
    acc += weights[i] / total;
    if (r < acc) return list[i];
  }
  return list[list.length - 1];
}

const EVOLUTION: Partial<Record<AutonomyActivity, string>> = {
  explore: 'auto_explore',
  socialize: 'auto_socialize',
  rest: 'auto_rest_home',
  wait_owner: 'auto_wait_owner',
};

export function simulate(input: SimInput, cfg: AutonomyConfig, today: string): SimResult {
  const fresh = (day: string): AutonomyDaily => ({ day, items: 0, happiness: 0, energy: 0, encounters: 0 });
  const clock = input.clock;
  // Sin reloj, los contadores son los de hoy (como siempre). Con él, los del día de cada hora.
  let current: AutonomyDaily = input.daily && (clock || input.daily.day === today) ? { ...input.daily } : fresh(today);
  let past: AutonomyDaily | null = null;
  const countersOf = (day: string): AutonomyDaily => {
    if (day === current.day) return current;
    if (day > current.day) return (current = fresh(day));
    // Una hora de un día ya cerrado no gasta los topes de un día posterior
    if (past?.day !== day) past = fresh(day);
    return past;
  };
  const res: SimResult = { episodes: [], evolutionEvents: [], energyDelta: 0, happinessDelta: 0, itemsFound: [], encounters: [], practices: 0, daily: current };
  const routineCfg = clock ? cfg.routine : undefined;
  let routine = normalizeRoutine(input.routine);
  let energy = input.energy;
  let sleptLogged = false;

  for (let idx = input.from; idx <= input.to; idx++) {
    const rng = createRng(hashSeed(`autonomy:${input.petId}:${idx}`));
    const rActivity = rng();
    const rMemorable = rng();
    const rItem = rng();
    const rText = rng();
    const rFriend = rng();

    if (input.sleeping) {
      // Dormido: el lazy tick ya recupera la energía; aquí solo se recuerda (una vez por tanda)
      if (!sleptLogged) {
        res.episodes.push({ index: idx, activity: 'sleep', content: pick(textsOf('sleep'), rText), importance: 0.3, valence: 0.2 });
        sleptLogged = true;
      }
      continue;
    }

    const at = clock?.(idx);
    const daily = at ? countersOf(at.day) : current;
    const phase = routineCfg && at ? phaseOf(at.hour, routineCfg) : null;
    const activity = chooseActivity(input, energy, rActivity, cfg, routineCfg && phase ? (a) => routineFactor(a, phase, routine, idx, routineCfg) : undefined);
    const conf = cfg.activities[activity]!;
    if (routineCfg) routine = advanceRoutine(routine, activity, idx);
    // Lleva un buen rato con lo mismo: se cuenta una vez, en vez de repetir el mismo recuerdo
    const long = !!routineCfg && isLongStretch(routine, routineCfg);
    const repeating = !!routineCfg && routine.streak > 1;
    if (activity === 'practice_trick') res.practices++;

    // Energía y felicidad con topes diarios (el lazy tick sigue gestionando el decaimiento)
    if (conf.energy > 0) {
      const gain = Math.min(conf.energy, Math.max(0, cfg.dailyEnergyCap - daily.energy));
      daily.energy += gain;
      res.energyDelta += gain;
      energy += gain;
    } else if (conf.energy < 0) {
      res.energyDelta += conf.energy;
      energy += conf.energy;
    }
    if (conf.happiness > 0) {
      const gain = Math.min(conf.happiness, Math.max(0, cfg.dailyHappinessCap - daily.happiness));
      daily.happiness += gain;
      res.happinessDelta += gain;
    }
    const ev = EVOLUTION[activity];
    if (ev && activity !== 'rest') res.evolutionEvents.push(ev);
    if (activity === 'rest' && input.inHabitat) res.evolutionEvents.push('auto_rest_home');

    let episode: Episode | null = null;
    if (activity === 'explore') {
      const chance = cfg.itemFind.chancePerExplore + Math.max(0, input.dims.curiosity - 50) * cfg.itemFind.curiosityBonusPerPoint;
      if (rItem < chance && daily.items < cfg.itemFind.dailyCap && cfg.itemFind.items.length) {
        const itemId = pick(cfg.itemFind.items, rText);
        daily.items++;
        res.itemsFound.push(itemId);
        res.evolutionEvents.push('auto_find_item');
        episode = { index: idx, activity, content: text('AUTO_FIND', { item: input.itemNames?.[itemId] ?? itemId }), importance: 0.6, valence: 0.6, itemId };
      }
    }
    if (activity === 'socialize' && input.friends.length && daily.encounters < cfg.social.dailyCapPerPet) {
      const friend = pickFriend(input.friends, rFriend);
      daily.encounters++;
      res.encounters.push({ index: idx, friend });
      episode = {
        index: idx,
        activity,
        content: text('AUTO_VISIT_FRIEND', { owner: friend.ownerName, friend: friend.name }),
        importance: 0.65,
        valence: 0.6,
        friend,
      };
    }
    if (!episode && long && textsOf(`long_${activity}` as AutonomyActivity).length) {
      episode = { index: idx, activity, content: pick(textsOf(`long_${activity}` as AutonomyActivity), rText), importance: 0.5, valence: activity === 'wait_owner' ? -0.2 : 0.4 };
    }
    if (!episode && !repeating && rMemorable < cfg.memorableChance) {
      episode = { index: idx, activity, content: pick(textsOf(activity), rText), importance: activity === 'explore' ? 0.45 : 0.35, valence: activity === 'wait_owner' ? -0.1 : 0.3 };
    }
    if (episode) res.episodes.push(episode);
  }

  // Solo los más importantes llegan a la memoria (evita inundarla tras una ausencia larga)
  if (res.episodes.length > cfg.maxEpisodesPerCatchUp) {
    res.episodes = [...res.episodes]
      .sort((a, b) => b.importance - a.importance || a.index - b.index)
      .slice(0, cfg.maxEpisodesPerCatchUp)
      .sort((a, b) => a.index - b.index);
  }
  res.daily = current;
  if (routineCfg) res.routine = routine;
  return res;
}

/** Probabilidad de encuentro en el barrido social (dos mascotas de amigos, ambos entrenadores fuera). */
export function encounterRoll(pairKey: string, slot: number, sociabilityA: number, sociabilityB: number, cfg: AutonomyConfig): boolean {
  const rng = createRng(hashSeed(`encounter:${pairKey}:${slot}`));
  const factor = 0.5 + (sociabilityA + sociabilityB) / 200; // 0.5..1.5
  return rng() < cfg.social.encounterChance * factor;
}
