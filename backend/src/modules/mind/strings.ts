/**
 * Textos por datos (spec 37 §5.1). Las frases que la mascota dice o recuerda sin LLM viven en
 * `shared/game-data/strings/<idioma>.json` como «ID de línea → texto». El código solo maneja IDs.
 *
 * - **Variantes por carácter.** Un ID puede tener variantes por palabra clave de banda
 *   (`DLG_VISIT_GREET@outgoing`): se elige la primera que coincida con el carácter actual y, si
 *   no hay ninguna, la base. Así dos Pockai dicen cosas distintas sin duplicar nada.
 * - **Alternativas.** `ID_1`, `ID_2`… son frases equivalentes entre las que elige quien llama.
 * - **Interpolación.** Solo los nombres de `PLACEHOLDERS`, y ya saneados: nunca texto libre.
 *
 * Los recuerdos se guardan con el texto ya resuelto: el LLM los lee tal cual.
 */

export const LANGS = ['es', 'en'] as const;
export type Lang = (typeof LANGS)[number];

/** Únicos nombres que una línea puede interpolar. */
export const PLACEHOLDERS = ['pet', 'friend', 'visitor', 'owner', 'item', 'hint', 'mood', 'story'] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];

type Table = Record<string, string>;

// Mismo mecanismo que el resto de datos de juego que no se recargan en caliente
const TABLES: Record<Lang, Table> = {
  es: require('../../../../shared/game-data/strings/es.json'),
  en: require('../../../../shared/game-data/strings/en.json'),
};

export interface TextOptions {
  lang?: Lang;
  /** Palabras clave del carácter actual (una por dimensión), para elegir variante. */
  keywords?: readonly string[];
}

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGS as readonly string[]).includes(v);
}

export function hasText(id: string, lang: Lang = 'es'): boolean {
  return typeof TABLES[lang]?.[id] === 'string';
}

/** Quita lo que no debe llegar a una frase: llaves (no se interpola dos veces), saltos y control. */
export function sanitizeParam(value: unknown, max = 300): string {
  return String(value ?? '')
    .replace(/[{}\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trimEnd();
}

/** Plantilla de una línea en un idioma, con su variante de carácter si la hay; `null` si no existe. */
function template(id: string, opts: TextOptions): string | null {
  const table = TABLES[opts.lang ?? 'es'] ?? TABLES.es;
  for (const kw of opts.keywords ?? []) {
    const v = table[`${id}@${kw}`];
    if (typeof v === 'string') return v;
  }
  const base = table[id];
  if (typeof base === 'string') return base;
  // Un idioma incompleto no deja a la mascota muda: cae al castellano
  if ((opts.lang ?? 'es') !== 'es') return template(id, { ...opts, lang: 'es' });
  return null;
}

/**
 * Texto de una línea. Lanza si el ID no existe: es un error de datos que `pnpm validate:data`
 * detecta antes, no algo que deba llegar en silencio a un jugador.
 */
export function text(id: string, params: Partial<Record<Placeholder, unknown>> = {}, opts: TextOptions = {}): string {
  const tpl = template(id, opts);
  if (tpl === null) throw new Error(`Línea de texto desconocida: ${id}`);
  return tpl.replace(/\{(\w+)\}/g, (whole, name: string) =>
    (PLACEHOLDERS as readonly string[]).includes(name) && params[name as Placeholder] !== undefined ? sanitizeParam(params[name as Placeholder]) : whole,
  );
}

/** Frases alternativas `<prefijo>_1`, `<prefijo>_2`…, en orden. */
export function variants(prefix: string, lang: Lang = 'es'): string[] {
  const out: string[] = [];
  for (let i = 1; hasText(`${prefix}_${i}`, lang) || (lang !== 'es' && hasText(`${prefix}_${i}`, 'es')); i++) {
    out.push(text(`${prefix}_${i}`, {}, { lang }));
  }
  if (!out.length) throw new Error(`Sin frases para ${prefix}`);
  return out;
}

/** Todos los IDs de un idioma (para tests y validación). */
export function textIds(lang: Lang = 'es'): string[] {
  return Object.keys(TABLES[lang] ?? {});
}
