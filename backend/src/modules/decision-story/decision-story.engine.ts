/**
 * Motor puro de la aventura diaria (sin Nest ni base de datos): fechas del bucket, canon de la
 * comunidad, resultado de una partida y vista pública de las escenas.
 */
import { StoriesConfig, StoryOutcome, StoryScene } from '../game-data/story-data.schemas';

/** Fecha local `YYYY-MM-DD` de un instante en una zona horaria IANA (UTC si la zona no es válida). */
export function localDate(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(now);
  }
}

/** Hora local (0-23) de un instante en una zona horaria IANA. */
export function localHour(now: Date, timeZone: string): number {
  let tz = timeZone;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
  } catch {
    tz = 'UTC';
  }
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(now);
  return Number(hour) % 24;
}

/** Suma días a una fecha `YYYY-MM-DD`. */
export function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** PRNG determinista (mulberry32) a partir de un texto: mismo texto, misma secuencia. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Baraja las opciones de cada escena con una semilla. Los modelos tienden a escribir primero la
 * mejor opción; barajar evita que la posición delate cuál es.
 */
export function shuffleChoices(scenes: StoryScene[], seed: string): StoryScene[] {
  const rnd = seededRandom(seed);
  return scenes.map((scene) => {
    const choices = [...scene.choices];
    for (let i = choices.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [choices[i], choices[j]] = [choices[j], choices[i]];
    }
    return { ...scene, choices };
  });
}

export interface TallyRow {
  sceneIndex: number;
  optionIndex: number;
  count: number;
}

/** Votos por opción de una escena (0 para las que nadie eligió). */
export function sceneCounts(scene: StoryScene, sceneIndex: number, tallies: TallyRow[]): number[] {
  const counts = scene.choices.map(() => 0);
  for (const t of tallies) {
    if (t.sceneIndex === sceneIndex && t.optionIndex >= 0 && t.optionIndex < counts.length) counts[t.optionIndex] = t.count;
  }
  return counts;
}

export interface Canon {
  /** Opción canónica de cada escena. */
  options: number[];
  /** Votos totales de cada escena. */
  votes: number[];
  /** Resumen en pasado de lo que «ocurrió»: alimenta la historia del día siguiente. */
  summary: string;
}

/**
 * Canon de una historia al cerrar su día: en cada escena gana la opción más votada (en empate, la de
 * índice menor). Con menos de `minVotes` votos la comunidad aún no ha decidido: gana la opción de
 * mayor `score`, para que la crónica avance igualmente.
 */
export function computeCanon(scenes: StoryScene[], tallies: TallyRow[], minVotes: number): Canon {
  const options: number[] = [];
  const votes: number[] = [];
  const lines: string[] = [];
  scenes.forEach((scene, i) => {
    const counts = sceneCounts(scene, i, tallies);
    const total = counts.reduce((a, b) => a + b, 0);
    const ranking = total >= minVotes ? counts : scene.choices.map((c) => c.score);
    let best = 0;
    for (let k = 1; k < ranking.length; k++) if (ranking[k] > ranking[best]) best = k;
    options.push(best);
    votes.push(total);
    lines.push(scene.choices[best].canonLine);
  });
  return { options, votes, summary: lines.join(' ') };
}

/** Resultado de una partida: media de la calidad (0-2) de las opciones elegidas, normalizada a 0-1. */
export function resolveOutcome(scenes: StoryScene[], answers: number[], cfg: StoriesConfig): { score: number; outcome: StoryOutcome } {
  const total = scenes.reduce((sum, scene, i) => sum + (scene.choices[answers[i]]?.score ?? 0), 0);
  const score = scenes.length > 0 ? total / (scenes.length * 2) : 0;
  const outcome: StoryOutcome = score >= cfg.outcome.winAt ? 'win' : score >= cfg.outcome.partialAt ? 'partial' : 'lose';
  return { score: Math.round(score * 1000) / 1000, outcome };
}

export interface PublicScene {
  index: number;
  locationId: string;
  mood?: StoryScene['mood'];
  narration: string;
  event: StoryScene['event'];
  /** Solo lo que se puede enseñar antes de elegir: ni `score`, ni `consequence`, ni `canonLine`. */
  choices: Array<{ label: string; approach: string }>;
}

/** Escena tal y como la ve el cliente antes de responder. */
export function publicScene(scene: StoryScene, index: number): PublicScene {
  return {
    index,
    locationId: scene.locationId,
    ...(scene.mood ? { mood: scene.mood } : {}),
    narration: scene.narration,
    event: scene.event,
    choices: scene.choices.map((c) => ({ label: c.label, approach: c.approach })),
  };
}
