/**
 * Frases con variables. Lo que el Pockai dice por su cuenta (bocadillos, avisos) no lo escribe un
 * modelo: son plantillas de los datos de juego (`shared/game-data/phrases.json`) con huecos como
 * `{{nombre.custodio}}` que se rellenan con lo que la criatura sabe.
 *
 * - Una frase solo es candidata si se conocen **todas** sus variables: nunca sale un hueco vacío
 *   ni un «undefined».
 * - Qué frase toca se decide con el mismo selector por utilidad que las conductas: personalidad,
 *   contexto (`when`), enfriamiento por frase y penalización por repetición.
 *
 * Funciones puras: el reloj y el azar llegan de fuera. Las usan el servidor (que decide por las
 * apps) y el escritorio.
 */
import type { Dims } from './dims';
import type { Rng } from './rng';
import { DEFAULT_UTILITY, selectByUtility, type UtilityConfig } from './utility';

/** Valores de las variables. Lo que falte, o venga vacío, cuenta como desconocido. */
export type PhraseVars = Readonly<Record<string, string | number | null | undefined>>;

/** `{{nombre.custodio}}`: minúsculas, dígitos y guion bajo, en partes separadas por puntos. */
const VARIABLE = /\{\{\s*([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*)\s*\}\}/g;
/** Cualquier llave doble, bien o mal escrita (para avisar de plantillas rotas). */
const ANY_BRACES = /\{\{[^}]*\}\}|\{\{|\}\}/g;

/** Variables que usa una plantilla, sin repetir y en orden de aparición. */
export function variablesOf(template: string): string[] {
  const out: string[] = [];
  for (const m of template.matchAll(VARIABLE)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** Trozos con llaves dobles que no son una variable válida (`{{Nombre}}`, `{{a..b}}`, `{{`). */
export function malformedVariables(template: string): string[] {
  const valid = new Set([...template.matchAll(VARIABLE)].map((m) => m[0]));
  return [...template.matchAll(ANY_BRACES)].map((m) => m[0]).filter((piece) => !valid.has(piece));
}

/**
 * Deja un valor listo para ir dentro de una frase: sin llaves (no se interpola dos veces), sin
 * saltos ni caracteres de control, y con un largo máximo. Devuelve `''` si no queda nada.
 */
export function sanitizeValue(value: unknown, max = 60): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value)
    .replace(/[{}<>\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trimEnd();
}

/** Variables de la plantilla cuyo valor no se conoce. */
export function missingVariables(template: string, vars: PhraseVars): string[] {
  return variablesOf(template).filter((name) => !sanitizeValue(vars[name]));
}

/** Frase con sus huecos rellenos, o `null` si falta alguna variable. */
export function renderPhrase(template: string, vars: PhraseVars): string | null {
  if (missingVariables(template, vars).length) return null;
  return template.replace(VARIABLE, (_whole, name: string) => sanitizeValue(vars[name]));
}

/** Condiciones de contexto de una frase, sobre un conjunto cerrado de señales. */
export interface PhraseWhen {
  /** Tienen que darse todas. */
  all?: readonly string[];
  /** Tiene que darse al menos una. */
  any?: readonly string[];
  /** No puede darse ninguna. */
  none?: readonly string[];
}

export interface PhraseEntry {
  id: string;
  /** Para qué sirve: quien pide una frase filtra por aquí (`greeting`, `care`, `wish`…). */
  kind: string;
  /** Texto por idioma. */
  text: Readonly<Record<string, string>>;
  /** Peso de partida (por defecto 1). */
  base?: number;
  /** Cuánto mueve el peso cada punto de dimensión por encima o por debajo de 50. */
  weights?: Partial<Dims>;
  when?: PhraseWhen;
  /** Tiempo mínimo entre dos apariciones de esta frase. */
  cooldownMinutes?: number;
}

export interface PhraseContext {
  vars: PhraseVars;
  dims: Dims;
  /** Idioma pedido; si la frase no lo tiene, se usa `fallbackLang`. */
  lang: string;
  fallbackLang?: string;
  /** Señales que se dan ahora (`morning`, `back_from_absence`, `hungry`…). */
  flags: ReadonlySet<string>;
  /** Frases dichas hace poco, la más reciente al final. */
  recent: readonly string[];
  /** Momento (ms) en que se dijo por última vez cada frase. */
  lastAt: Readonly<Record<string, number>>;
  now: number;
  rng: Rng;
  cfg?: UtilityConfig;
}

export interface PickedPhrase {
  id: string;
  kind: string;
  text: string;
  lang: string;
}

/** ¿Se cumplen las condiciones de contexto? */
export function whenHolds(when: PhraseWhen | undefined, flags: ReadonlySet<string>): boolean {
  if (!when) return true;
  if (when.all && !when.all.every((f) => flags.has(f))) return false;
  if (when.any && when.any.length > 0 && !when.any.some((f) => flags.has(f))) return false;
  if (when.none && when.none.some((f) => flags.has(f))) return false;
  return true;
}

/** Plantilla de una frase en el idioma pedido (o en el de reserva) y qué idioma es. */
export function templateOf(entry: PhraseEntry, lang: string, fallbackLang = 'es'): { template: string; lang: string } | null {
  if (typeof entry.text[lang] === 'string' && entry.text[lang]) return { template: entry.text[lang], lang };
  if (typeof entry.text[fallbackLang] === 'string' && entry.text[fallbackLang]) return { template: entry.text[fallbackLang], lang: fallbackLang };
  return null;
}

/**
 * Frases que se pueden decir ahora: del tipo pedido, con el contexto adecuado y con todas sus
 * variables conocidas. No mira enfriamientos ni repetición (eso es de `pickPhrase`).
 */
export function eligiblePhrases(entries: readonly PhraseEntry[], ctx: Pick<PhraseContext, 'vars' | 'lang' | 'fallbackLang' | 'flags'>, kinds?: readonly string[]): PhraseEntry[] {
  return entries.filter((e) => {
    if (kinds && !kinds.includes(e.kind)) return false;
    if (!whenHolds(e.when, ctx.flags)) return false;
    const t = templateOf(e, ctx.lang, ctx.fallbackLang);
    return !!t && missingVariables(t.template, ctx.vars).length === 0;
  });
}

/**
 * Elige una frase y la devuelve ya escrita, o `null` si ahora no hay ninguna que decir. Misma
 * entrada, misma frase.
 */
export function pickPhrase(entries: readonly PhraseEntry[], ctx: PhraseContext, kinds?: readonly string[]): PickedPhrase | null {
  const pool = eligiblePhrases(entries, ctx, kinds);
  if (!pool.length) return null;
  const id = selectByUtility({
    candidates: pool.map((e) => ({
      id: e.id,
      base: e.base ?? 1,
      weights: e.weights,
      cooldownMs: e.cooldownMinutes ? e.cooldownMinutes * 60_000 : undefined,
    })),
    dims: ctx.dims,
    recent: ctx.recent,
    lastAt: ctx.lastAt,
    now: ctx.now,
    rng: ctx.rng,
    cfg: ctx.cfg ?? DEFAULT_UTILITY,
  });
  const entry = id ? pool.find((e) => e.id === id) : undefined;
  const t = entry ? templateOf(entry, ctx.lang, ctx.fallbackLang) : null;
  const text = t ? renderPhrase(t.template, ctx.vars) : null;
  return entry && t && text ? { id: entry.id, kind: entry.kind, text, lang: t.lang } : null;
}
