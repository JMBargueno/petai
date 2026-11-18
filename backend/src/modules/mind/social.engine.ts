/**
 * Social Engine (spec 37 §6.1 y §6.3) — funciones puras.
 *
 * Dos cosas:
 * - **Relación por etapas.** La memoria emocional guarda una valencia (-1..1) y una familiaridad
 *   por sujeto. De ahí sale una etapa (desconocido → conocido → amigo → mejor amigo) que cambia
 *   qué pasa cuando dos criaturas se ven. Entrar y salir de una etapa tienen umbrales distintos,
 *   para que una relación en el borde no salte de una a otra en cada encuentro.
 * - **Escena.** Qué viven dos Pockai cuando se encuentran: se elige con las dos personalidades,
 *   sus necesidades y su etapa, y se resuelve con un generador sembrado por la pareja y la ranura
 *   de tiempo. Misma pareja y misma ranura dan siempre la misma escena, la mire quien la mire.
 *
 * Por decisión de producto no hay etapa «rival»: dos Pockai pueden discutir y reconciliarse, pero
 * la relación tiene suelo.
 *
 * Los textos de los episodios viven aquí en castellano; el lote 5 de la spec 37 (diálogo por
 * datos) los pasará a identificadores de línea.
 */
import { createRng, hashSeed } from '../battles/combat/rng';
import { DIMENSIONS, Dims } from './mind.types';
import { weighted } from './personality.engine';

export const STAGES = ['stranger', 'acquaintance', 'friend', 'best_friend'] as const;
export type Stage = (typeof STAGES)[number];

export const SCENE_TYPES = ['greet', 'explore_together', 'play_tag', 'share_food', 'nap_together', 'squabble', 'make_up'] as const;
export type SceneType = (typeof SCENE_TYPES)[number];

export interface SocialConfig {
  stages: {
    acquaintance: { familiarity: number };
    friend: { familiarity: number; enterValence: number; exitValence: number };
    best_friend: { familiarity: number; enterValence: number; exitValence: number };
  };
  /** Lo más baja que puede quedar la relación entre dos Pockai. */
  valenceFloor: number;
  scene: {
    /** Cada cuánto vive una pareja una escena nueva durante una visita. */
    slotMs: number;
    /** Escenas de una misma visita que dejan recuerdo y mueven la relación. */
    maxEffectScenesPerVisit: number;
    /** Multiplicador del peso de repetir la escena anterior. */
    repeatFactor: number;
  };
  scenes: Record<SceneType, SceneConfig>;
}

export interface SceneConfig {
  base: number;
  /** Pesos por dimensión, aplicados a la media de las dos personalidades. */
  weights?: Partial<Dims>;
  /** Cambio de valencia que provoca en cada uno hacia el otro. */
  delta: number;
  /** Etapa mínima de la relación. */
  minStage?: Stage;
  /** Etapa máxima (p. ej. presentarse solo tiene sentido entre quienes apenas se conocen). */
  maxStage?: Stage;
  /** Energía mínima de los dos. */
  minEnergy?: number;
  /** Energía máxima de los dos (la siesta es de cansados). */
  maxEnergy?: number;
  /** Temperamento mínimo de los dos. */
  minTemper?: number;
  /** Solo justo después de esta escena. */
  after?: SceneType;
  /** Solo en la primera ranura de la visita. */
  firstSlotOnly?: boolean;
}

const rank = (s: Stage) => STAGES.indexOf(s);

export function isStage(v: unknown): v is Stage {
  return typeof v === 'string' && (STAGES as readonly string[]).includes(v);
}

/**
 * Etapa de una relación tras un encuentro. `prev` es la etapa guardada: hace falta para la
 * histéresis (se sube al superar el umbral de entrada y solo se baja al caer del de salida).
 * La familiaridad nunca baja, así que de «conocido» no se vuelve a «desconocido».
 */
export function nextStage(prev: Stage | null | undefined, valence: number, familiarity: number, cfg: SocialConfig): Stage {
  const s = cfg.stages;
  let stage: Stage = prev ?? 'stranger';

  // Bajar: solo por caer del umbral de salida de la etapa en la que está
  if (stage === 'best_friend' && valence < s.best_friend.exitValence) stage = 'friend';
  if (stage === 'friend' && valence < s.friend.exitValence) stage = 'acquaintance';

  // Subir: de una en una, cada escalón con su umbral de entrada
  if (stage === 'stranger' && familiarity >= s.acquaintance.familiarity) stage = 'acquaintance';
  if (stage === 'acquaintance' && familiarity >= s.friend.familiarity && valence >= s.friend.enterValence) stage = 'friend';
  if (stage === 'friend' && familiarity >= s.best_friend.familiarity && valence >= s.best_friend.enterValence) stage = 'best_friend';
  return stage;
}

/** Aplica el suelo de la relación entre dos Pockai: se pican, pero no se odian. */
export function floorValence(valence: number, cfg: SocialConfig): number {
  return Math.max(cfg.valenceFloor, valence);
}

export const STAGE_LABEL: Record<Stage, string> = {
  stranger: 'un desconocido',
  acquaintance: 'un conocido',
  friend: 'un amigo',
  best_friend: 'su mejor amigo',
};

export interface SceneActor {
  petId: string;
  name: string;
  /** Nombre de su entrenador (para los episodios del otro). */
  ownerName: string;
  dims: Dims;
  energy: number;
}

export interface SceneInput {
  host: SceneActor;
  guest: SceneActor;
  /** Etapa de la relación entre ambos (la del anfitrión hacia el visitante). */
  stage: Stage;
  /** Ranura de la visita (0 = llegada). */
  slot: number;
  /** Escena de la ranura anterior, si la hubo. */
  previous?: SceneType | null;
}

export interface SceneSide {
  /** Recuerdo en primera persona desde su punto de vista. */
  episode: string;
  /** Cambio de valencia hacia el otro. */
  delta: number;
  /** Valencia del recuerdo (cómo de bien o mal lo vivió). */
  mood: number;
}

export interface SceneResult {
  type: SceneType;
  slot: number;
  host: SceneSide;
  guest: SceneSide;
}

/** Semilla de la pareja en una ranura: no depende de quién sea anfitrión. */
export function sceneSeed(petA: string, petB: string, slot: number): number {
  const [a, b] = [petA, petB].sort();
  return hashSeed(`scene:${a}:${b}:${slot}`);
}

function meanDims(a: Dims, b: Dims): Dims {
  const out = {} as Dims;
  for (const d of DIMENSIONS) out[d] = (a[d] + b[d]) / 2;
  return out;
}

/** Escenas posibles ahora, con su peso. */
export function sceneCandidates(input: SceneInput, cfg: SocialConfig): { type: SceneType; weight: number }[] {
  const { host, guest, stage, slot, previous } = input;
  const dims = meanDims(host.dims, guest.dims);
  const minEnergy = Math.min(host.energy, guest.energy);
  const maxEnergy = Math.max(host.energy, guest.energy);
  const minTemper = Math.min(host.dims.temper, guest.dims.temper);
  const out: { type: SceneType; weight: number }[] = [];
  for (const type of SCENE_TYPES) {
    const c = cfg.scenes[type];
    if (!c) continue;
    if (c.minStage && rank(stage) < rank(c.minStage)) continue;
    if (c.maxStage && rank(stage) > rank(c.maxStage)) continue;
    if (c.firstSlotOnly && slot !== 0) continue;
    if (c.after && previous !== c.after) continue;
    if (c.minEnergy !== undefined && minEnergy < c.minEnergy) continue;
    if (c.maxEnergy !== undefined && maxEnergy > c.maxEnergy) continue;
    if (c.minTemper !== undefined && minTemper < c.minTemper) continue;
    let weight = weighted(c.base, c.weights ?? {}, dims);
    if (previous === type) weight *= cfg.scene.repeatFactor;
    if (weight > 0) out.push({ type, weight });
  }
  return out;
}

type Lines = { first: string[]; again: string[] };

/**
 * Episodios por escena y papel. `{other}` es el otro Pockai y `{owner}` su entrenador. `first` es
 * para quienes apenas se conocen; `again`, para amigos (el quinto encuentro no se cuenta como el primero).
 */
const EPISODES: Record<SceneType, { host: Lines; guest: Lines }> = {
  greet: {
    host: {
      first: ['{owner} vino a visitarme con {other}. Nos olisqueamos con curiosidad.', 'Hoy conocí a {other}, que vino de visita con {owner}.'],
      again: ['{other} volvió a visitarme con {owner}. ¡Qué alegría verle!', '{owner} trajo otra vez a {other}; salí corriendo a recibirle.'],
    },
    guest: {
      first: ['Fui de visita al hábitat de {owner} y conocí a {other}.', 'Visité a {other} en su casa. Me recibió con curiosidad.'],
      again: ['Volví al hábitat de {owner} a ver a {other}. Me recibió con alegría.', 'Fui otra vez a casa de {other}; ya me conozco el camino.'],
    },
  },
  explore_together: {
    host: {
      first: ['Le enseñé mi hábitat a {other}, rincón por rincón.', '{other} y yo curioseamos juntos por toda mi sala.'],
      again: ['{other} y yo revisamos mi hábitat por si había algo nuevo.', 'Le enseñé a {other} mi rincón favorito.'],
    },
    guest: {
      first: ['{other} me enseñó su hábitat. Tiene cosas que yo no tengo.', 'Curioseé con {other} por toda su sala.'],
      again: ['{other} me enseñó lo nuevo de su hábitat.', 'Volví a husmear por la sala de {other}; siempre encuentro algo.'],
    },
  },
  play_tag: {
    host: {
      first: ['Jugué al pilla-pilla con {other} por mi sala. Corre mucho.', '{other} y yo nos perseguimos hasta quedarnos sin aliento.'],
      again: ['Otra partida de pilla-pilla con {other}. Esta vez le alcancé yo.', '{other} y yo jugamos a perseguirnos, como siempre que viene.'],
    },
    guest: {
      first: ['Jugué al pilla-pilla con {other} en su sala. ¡Qué divertido!', '{other} me persiguió por toda su casa y casi me pilla.'],
      again: ['Volví a jugar al pilla-pilla con {other}. Ya nos sabemos los trucos.', 'Otra carrera con {other} por su sala; no me canso.'],
    },
  },
  share_food: {
    host: {
      first: ['Compartí mi comida con {other}.', 'Le dejé a {other} probar de mi cuenco.'],
      again: ['Compartí mi comida con {other}, como buenos amigos.', '{other} y yo comimos juntos; le guardé lo mejor.'],
    },
    guest: {
      first: ['{other} compartió su comida conmigo.', '{other} me dejó probar de su cuenco. Qué detalle.'],
      again: ['{other} compartió su comida conmigo, como siempre.', 'Comí con {other}; me guardó lo mejor.'],
    },
  },
  nap_together: {
    host: {
      first: ['{other} y yo estábamos cansados y nos echamos una siesta juntos.', 'Dormí un rato al lado de {other}.'],
      again: ['Siesta con {other}, acurrucados. Se duerme mejor en compañía.', '{other} se quedó dormido a mi lado y yo también.'],
    },
    guest: {
      first: ['Me eché una siesta en casa de {other}, a su lado.', 'Estaba cansado y dormí un rato junto a {other}.'],
      again: ['Siesta en casa de {other}, acurrucados.', 'Me dormí al lado de {other}; en su casa descanso bien.'],
    },
  },
  squabble: {
    host: {
      first: ['{other} y yo discutimos por un juguete. Los dos queríamos mandar.', 'Me piqué con {other}: ninguno quería ceder.'],
      again: ['{other} y yo nos picamos por una tontería. Ya se nos pasará.', 'Discutí con {other}; los dos tenemos mucho genio.'],
    },
    guest: {
      first: ['Discutí con {other} en su casa. Los dos queríamos mandar.', 'Me piqué con {other}: ninguno quería ceder.'],
      again: ['{other} y yo nos picamos por una tontería. Ya se nos pasará.', 'Discutí con {other}; los dos tenemos mucho genio.'],
    },
  },
  make_up: {
    host: {
      first: ['{other} y yo hicimos las paces. Mejor así.', 'Me reconcilié con {other} después del pique.'],
      again: ['{other} y yo hicimos las paces enseguida. No sabemos estar enfadados.', 'Me reconcilié con {other}; lo de antes fue una tontería.'],
    },
    guest: {
      first: ['Hice las paces con {other}. Mejor así.', 'Me reconcilié con {other} después del pique.'],
      again: ['Hice las paces con {other} enseguida. No sabemos estar enfadados.', 'Me reconcilié con {other}; lo de antes fue una tontería.'],
    },
  },
};

const fill = (text: string, other: SceneActor) => text.replace(/\{other\}/g, other.name).replace(/\{owner\}/g, other.ownerName);

/**
 * Resuelve la escena de una pareja en una ranura. Función pura y determinista: la semilla sale de
 * los dos ids (ordenados) y la ranura, así que repetirla no cambia el resultado.
 */
export function resolveScene(input: SceneInput, cfg: SocialConfig): SceneResult {
  const rng = createRng(sceneSeed(input.host.petId, input.guest.petId, input.slot));
  const rPick = rng();
  const rHost = rng();
  const rGuest = rng();

  const candidates = sceneCandidates(input, cfg);
  let type: SceneType = 'explore_together';
  const total = candidates.reduce((sum, c) => sum + c.weight, 0);
  if (total > 0) {
    let roll = rPick * total;
    type = candidates[candidates.length - 1].type;
    for (const c of candidates) {
      roll -= c.weight;
      if (roll < 0) {
        type = c.type;
        break;
      }
    }
  }

  const delta = cfg.scenes[type]?.delta ?? 0;
  const set: keyof Lines = rank(input.stage) >= rank('friend') ? 'again' : 'first';
  const pick = (lines: string[], r: number) => lines[Math.min(lines.length - 1, Math.floor(r * lines.length))];
  const mood = delta < 0 ? -0.3 : Math.min(0.8, 0.3 + delta * 3);
  return {
    type,
    slot: input.slot,
    host: { episode: fill(pick(EPISODES[type].host[set], rHost), input.guest), delta, mood },
    guest: { episode: fill(pick(EPISODES[type].guest[set], rGuest), input.host), delta, mood },
  };
}
