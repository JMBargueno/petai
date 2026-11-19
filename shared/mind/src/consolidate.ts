/**
 * Consolidación de la memoria (spec 41, fase E).
 *
 * La memoria de episodios tiene sitio limitado: cuando se llena, lo más viejo se olvida. Sin esto,
 * un Pockai que ha quedado cuarenta veces con su mejor amigo solo recuerda las últimas. Aquí, lo
 * que se va a olvidar se **pliega** antes en un resumen por grupo: «he quedado muchas veces con
 * Brasa y casi siempre lo pasamos genial». El detalle se pierde; lo vivido, no.
 *
 * - Un grupo es alguien (`sum:pet:<id>`, `sum:user:<id>`) o un tipo de vivencia (`sum:find`).
 * - De cada grupo se guarda solo un contador, la media de cómo fueron y las fechas: nunca texto.
 *   El texto del resumen lo escribe quien llama a partir de `digestView`, con frases de datos.
 * - Solo se pliegan los tipos de `kinds`. Lo nacido del chat no entra: resumirlo bien necesita
 *   entender el texto, y aquí no se lee ninguno.
 *
 * Funciones puras: sin reloj ni azar.
 */

export type GroupBy = 'subject' | 'kind';

export interface ConsolidationConfig {
  /** Tipo de episodio → cómo se agrupa. Lo que no esté aquí se olvida sin resumen, como antes. */
  kinds: Record<string, GroupBy>;
  /** Claves que no impiden plegar un episodio (el resto de episodios con clave se dejan). */
  keyPrefixes: string[];
  /** Hasta que un grupo no junta estos episodios no hay nada que resumir. */
  minCount: number;
  /** A partir de cuántos son «muchos» y no «varios». */
  manyFrom: number;
  maxDigests: number;
  tone: { good: number; bad: number };
  importance: { base: number; perEpisode: number; max: number };
}

export interface FoldableEpisode {
  kind: string;
  subject?: string | null;
  key?: string | null;
  valence: number;
  /** ms */
  at: number;
}

export interface DigestState {
  count: number;
  /** Media de cómo fueron, de -1 a 1. */
  valence: number;
  firstAt: number;
  lastAt: number;
}

export type Digests = Record<string, DigestState>;

export const DIGEST_PREFIX = 'sum:';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number) => Math.round(v * 1000) / 1000;

/** Grupo en el que se pliega un episodio; `null` si se olvida sin resumen. */
export function groupOf(ep: FoldableEpisode, cfg: ConsolidationConfig): string | null {
  const by = cfg.kinds[ep.kind];
  if (!by) return null;
  if (ep.key && !cfg.keyPrefixes.some((p) => ep.key!.startsWith(p))) return null;
  if (by === 'subject') {
    // Solo otros Pockai y otros entrenadores: lo del propio entrenador no se resume aquí
    if (!ep.subject || !/^(pet|user):[\w-]+$/.test(ep.subject)) return null;
    return `${DIGEST_PREFIX}${ep.subject}`;
  }
  return `${DIGEST_PREFIX}${ep.kind}`;
}

/** Lee lo guardado con desconfianza. */
export function normalizeDigests(raw: unknown): Digests {
  const out: Digests = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, v] of Object.entries(raw as Record<string, Partial<DigestState>>)) {
    if (!key.startsWith(DIGEST_PREFIX) || !v || typeof v !== 'object') continue;
    const { count, valence, firstAt, lastAt } = v;
    if (![count, valence, firstAt, lastAt].every((n) => typeof n === 'number' && Number.isFinite(n))) continue;
    if (!(count! >= 1)) continue;
    out[key] = { count: Math.floor(count!), valence: round(clamp(valence!, -1, 1)), firstAt: firstAt!, lastAt: lastAt! };
  }
  return out;
}

export interface FoldResult {
  digests: Digests;
  /** Grupos que han cambiado (hay que reescribir su resumen). */
  touched: string[];
  /** Grupos que se han soltado por falta de sitio (hay que borrar su resumen). */
  dropped: string[];
}

/** Pliega episodios que se van a olvidar en los contadores de su grupo. */
export function foldEpisodes(prev: Digests, episodes: readonly FoldableEpisode[], cfg: ConsolidationConfig): FoldResult {
  const digests: Digests = { ...prev };
  const touched = new Set<string>();
  for (const ep of episodes) {
    const key = groupOf(ep, cfg);
    if (!key) continue;
    const d = digests[key];
    const v = clamp(Number.isFinite(ep.valence) ? ep.valence : 0, -1, 1);
    digests[key] = d
      ? { count: d.count + 1, valence: round((d.valence * d.count + v) / (d.count + 1)), firstAt: Math.min(d.firstAt, ep.at), lastAt: Math.max(d.lastAt, ep.at) }
      : { count: 1, valence: round(v), firstAt: ep.at, lastAt: ep.at };
    touched.add(key);
  }
  // Sin sitio: se sueltan los grupos de los que hace más que no pasa nada
  const keys = Object.keys(digests);
  const dropped = keys.length > cfg.maxDigests ? keys.sort((a, b) => digests[a].lastAt - digests[b].lastAt).slice(0, keys.length - cfg.maxDigests) : [];
  for (const key of dropped) {
    delete digests[key];
    touched.delete(key);
  }
  return { digests, touched: [...touched], dropped };
}

export type DigestTone = 'good' | 'mixed' | 'bad';
export type DigestAmount = 'some' | 'many';

export interface DigestView {
  key: string;
  /** `pet`, `user` o el tipo de vivencia (`find`, `adventure`…). */
  group: string;
  /** `pet:<id>` o `user:<id>` cuando el grupo es alguien. */
  subject: string | null;
  amount: DigestAmount;
  tone: DigestTone;
  importance: number;
  count: number;
}

/** Cómo contar un grupo; `null` si todavía no hay bastante que resumir. */
export function digestView(key: string, d: DigestState, cfg: ConsolidationConfig): DigestView | null {
  if (d.count < cfg.minCount) return null;
  const rest = key.slice(DIGEST_PREFIX.length);
  const who = /^(pet|user):/.exec(rest);
  return {
    key,
    group: who ? who[1] : rest,
    subject: who ? rest : null,
    amount: d.count >= cfg.manyFrom ? 'many' : 'some',
    tone: d.valence >= cfg.tone.good ? 'good' : d.valence <= cfg.tone.bad ? 'bad' : 'mixed',
    importance: round(Math.min(cfg.importance.max, cfg.importance.base + cfg.importance.perEpisode * d.count)),
    count: d.count,
  };
}
