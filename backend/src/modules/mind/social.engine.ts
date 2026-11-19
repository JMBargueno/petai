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

export const SCENE_TYPES = ['greet', 'explore_together', 'play_tag', 'share_food', 'nap_together', 'squabble', 'make_up', 'give_gift'] as const;
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
  /** Rumores (spec 37 §6.4): qué puede contar un Pockai a otro de lo que ha vivido. */
  rumors?: RumorConfig;
  /** Menú del entrenador que visita (spec 37 §6.2). */
  visitor?: import('./visitor.engine').VisitorConfig;
}

export interface RumorConfig {
  /** Lista blanca de orígenes (`kind`) que se pueden contar. Lo que no esté aquí es privado. */
  kinds: string[];
  /** Probabilidad de que en una escena entre amigos uno le cuente algo al otro. */
  chance: number;
  /** Solo se cuenta lo reciente. */
  maxAgeDays: number;
  /** Importancia del recuerdo de segunda mano (baja: se olvida antes que lo vivido). */
  importance: number;
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
  /** Solo si alguno de los dos tiene algo que encontró por su cuenta (un regalo, §6.5). */
  requiresFind?: boolean;
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
  /** Tiene algo que encontró hace poco y que podría regalar. */
  hasFind?: boolean;
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
  /**
   * Es el momento de llegar. Por defecto, la ranura 0; un encuentro autónomo es una visita de una
   * sola escena y siempre lo es, aunque su ranura (que solo siembra el azar) sea otra.
   */
  first?: boolean;
  /** Viven en la misma casa (buddies del mismo entrenador): nadie va de visita ni se presenta. */
  sameHome?: boolean;
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
  /** En un regalo, quién lo da. */
  giver?: 'host' | 'guest';
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
  const first = input.first ?? slot === 0;
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
    if (c.firstSlotOnly && (!first || input.sameHome)) continue;
    if (c.requiresFind && !host.hasFind && !guest.hasFind) continue;
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
const EPISODES: Record<Exclude<SceneType, 'give_gift'>, { host: Lines; guest: Lines }> = {
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

/** Un regalo: `host` son las líneas de quien da y `guest` las de quien recibe, sea quien sea el anfitrión. */
const GIFT: { giver: Lines; receiver: Lines } = {
  giver: {
    first: ['Le regalé a {other} una cosa que encontré en mis paseos.'],
    again: ['Le regalé a {other} una cosa que encontré en mis paseos. Le hizo mucha ilusión.', 'Guardaba algo que encontré para {other} y hoy se lo di.'],
  },
  receiver: {
    first: ['{other} me regaló una cosa que encontró en sus paseos.'],
    again: ['{other} me regaló una cosa que encontró en sus paseos. ¡Qué detalle!', '{other} me había guardado un regalo de sus paseos.'],
  },
};

/** Episodios entre compañeros de casa (mismo entrenador): sin visitas ni presentaciones. */
const HOME_EPISODES: Record<SceneType, string[]> = {
  greet: ['Saludé a {other}, mi compañero de casa.', '{other} y yo nos dimos los buenos días.'],
  explore_together: ['{other} y yo curioseamos juntos por casa.', 'Husmeé por los rincones con {other}.'],
  play_tag: ['Jugué al pilla-pilla con {other} por casa.', '{other} y yo nos perseguimos hasta quedarnos sin aliento.'],
  share_food: ['Comí al lado de {other}; compartimos lo que había.', '{other} y yo comimos juntos.'],
  nap_together: ['Siesta con {other}, acurrucados.', 'Me dormí al lado de {other}.'],
  squabble: ['{other} y yo nos picamos por una tontería. Ya se nos pasará.', 'Discutí con {other}; los dos queríamos el mismo sitio.'],
  make_up: ['{other} y yo hicimos las paces enseguida.', 'Me reconcilié con {other}; vivimos juntos, no podemos estar enfadados.'],
  give_gift: ['Le di a {other} una cosa que encontré.', '{other} y yo nos enseñamos nuestros tesoros.'],
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
  // Tirada nueva al final: no cambia las escenas que ya salían con las tres primeras
  const rGiver = rng();

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
  if (input.sameHome) {
    const lines = HOME_EPISODES[type];
    return {
      type,
      slot: input.slot,
      host: { episode: fill(pick(lines, rHost), input.guest), delta, mood },
      guest: { episode: fill(pick(lines, rGuest), input.host), delta, mood },
    };
  }
  if (type === 'give_gift') {
    const both = !!input.host.hasFind && !!input.guest.hasFind;
    const giver: 'host' | 'guest' = both ? (rGiver < 0.5 ? 'host' : 'guest') : input.guest.hasFind ? 'guest' : 'host';
    const hostLines = giver === 'host' ? GIFT.giver : GIFT.receiver;
    const guestLines = giver === 'guest' ? GIFT.giver : GIFT.receiver;
    return {
      type,
      slot: input.slot,
      giver,
      host: { episode: fill(pick(hostLines[set], rHost), input.guest), delta, mood },
      guest: { episode: fill(pick(guestLines[set], rGuest), input.host), delta, mood },
    };
  }
  return {
    type,
    slot: input.slot,
    host: { episode: fill(pick(EPISODES[type].host[set], rHost), input.guest), delta, mood },
    guest: { episode: fill(pick(EPISODES[type].guest[set], rGuest), input.host), delta, mood },
  };
}

/** Lo mínimo de un recuerdo para decidir si se puede contar a otro Pockai. */
export interface Shareable {
  id: string;
  kind: string;
  content: string;
  key?: string | null;
  subject?: string | null;
  createdAt: Date;
}

/**
 * ¿Puede un Pockai contarle este episodio a otro? (spec 37 §6.4). Lista blanca: solo los orígenes
 * de `cfg.kinds`. Además, nunca nada con sujeto (nombraría a un tercero, o a su entrenador), ni
 * con clave (los episodios del chat, los deseos y los trucos la llevan), ni un rumor recibido: un
 * rumor da un solo salto.
 */
export function isShareable(m: Shareable, cfg: RumorConfig | undefined, now: Date): boolean {
  if (!cfg || !cfg.kinds.includes(m.kind)) return false;
  if (m.kind === 'rumor' || m.kind === 'summary') return false;
  if (m.subject || m.key) return false;
  return now.getTime() - m.createdAt.getTime() <= cfg.maxAgeDays * 86_400_000;
}

/** Semilla de lo que se cuentan dos Pockai en una ranura. */
export function rumorSeed(petA: string, petB: string, slot: number): number {
  const [a, b] = [petA, petB].sort();
  return hashSeed(`rumor:${a}:${b}:${slot}`);
}

export interface RumorPick {
  teller: 'host' | 'guest';
  source: Shareable;
  /** Lo que recuerda quien lo escucha. */
  content: string;
}

/**
 * Qué se cuentan en una escena, si se cuentan algo. Solo entre amigos, nunca en plena discusión.
 * Función pura: misma pareja y misma ranura, mismo rumor.
 */
export function pickRumor(
  input: { hostId: string; guestId: string; hostName: string; guestName: string; stage: Stage; slot: number; type: SceneType },
  shareable: { host: readonly Shareable[]; guest: readonly Shareable[] },
  cfg: SocialConfig,
  now: Date,
): RumorPick | null {
  const r = cfg.rumors;
  if (!r || rank(input.stage) < rank('friend') || input.type === 'squabble') return null;
  const rng = createRng(rumorSeed(input.hostId, input.guestId, input.slot));
  const rChance = rng();
  const rTeller = rng();
  const rPick = rng();
  if (rChance >= r.chance) return null;
  const options = {
    host: shareable.host.filter((m) => isShareable(m, r, now)),
    guest: shareable.guest.filter((m) => isShareable(m, r, now)),
  };
  let teller: 'host' | 'guest' = rTeller < 0.5 ? 'host' : 'guest';
  if (!options[teller].length) teller = teller === 'host' ? 'guest' : 'host';
  const list = options[teller];
  if (!list.length) return null;
  const source = list[Math.min(list.length - 1, Math.floor(rPick * list.length))];
  const name = teller === 'host' ? input.hostName : input.guestName;
  return { teller, source, content: `${name} me contó algo suyo: «${source.content}»` };
}
