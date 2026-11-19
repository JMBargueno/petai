// Validación de shared/game-data/phrases.json (frases con variables).
//
// La usa scripts/validate-game-data.js y la prueban los tests del backend, que además comprueban
// que reconoce las mismas variables que la librería (shared/mind/src/phrases.ts). Devuelve la
// lista de errores: vacía si todo está bien.

const VARIABLE = /\{\{\s*([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*)\s*\}\}/g;
const ANY_BRACES = /\{\{[^}]*\}\}|\{\{|\}\}/g;
const SOURCES = ['owner', 'pet', 'fact', 'relation', 'trick'];
const PHRASE_KEYS = ['id', 'kind', 'text', 'base', 'weights', 'when', 'cooldownMinutes'];

/** Variables que usa una plantilla, sin repetir y en orden de aparición. */
function variablesOf(template) {
  const out = [];
  for (const m of String(template).matchAll(VARIABLE)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** Trozos con llaves dobles que no son una variable válida. */
function malformedVariables(template) {
  const valid = new Set([...String(template).matchAll(VARIABLE)].map((m) => m[0]));
  return [...String(template).matchAll(ANY_BRACES)].map((m) => m[0]).filter((piece) => !valid.has(piece));
}

/**
 * @param {object} input
 * @param {object} input.phrases  contenido de phrases.json
 * @param {string[]} input.langs  idiomas que debe tener cada frase
 * @param {string[]} input.dims   dimensiones de personalidad (para `weights`)
 * @returns {string[]} errores
 */
function validatePhrases(input) {
  const errors = [];
  const { phrases: data, langs = ['es', 'en'], dims = [] } = input;
  if (!data || typeof data !== 'object') return ['phrases.json: vacío'];
  const variables = data.variables || {};
  const facts = data.facts || {};
  const flags = new Set(data.flags || []);
  const kinds = new Set(data.kinds || []);
  const where = 'phrases.json';

  for (const [id, f] of Object.entries(facts)) {
    if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(id)) errors.push(`${where} › facts: id mal formado «${id}»`);
    for (const lang of langs) if (!f.label || typeof f.label[lang] !== 'string' || !f.label[lang].trim()) errors.push(`${where} › facts.${id}: falta la etiqueta en ${lang}`);
    if (typeof f.hint !== 'string' || !f.hint.trim()) errors.push(`${where} › facts.${id}: falta \`hint\` (se le enseña al extractor)`);
    if (!(Number.isInteger(f.max) && f.max >= 4 && f.max <= 60)) errors.push(`${where} › facts.${id}: \`max\` debe ser un entero entre 4 y 60`);
  }
  for (const [name, v] of Object.entries(variables)) {
    if (variablesOf(`{{${name}}}`)[0] !== name) errors.push(`${where} › variables: nombre mal formado «${name}»`);
    if (!SOURCES.includes(v.source)) errors.push(`${where} › variables.${name}: origen desconocido «${v.source}»`);
    if (v.source === 'fact' && !(v.fact in facts)) errors.push(`${where} › variables.${name}: el dato «${v.fact}» no está en \`facts\``);
  }

  const ids = new Set();
  const list = Array.isArray(data.phrases) ? data.phrases : [];
  if (!list.length) errors.push(`${where}: no hay frases`);
  for (const p of list) {
    const at = `${where} › ${p && p.id}`;
    if (!p || typeof p.id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(p.id)) {
      errors.push(`${where}: frase sin id válido`);
      continue;
    }
    if (ids.has(p.id)) errors.push(`${at}: id repetido`);
    ids.add(p.id);
    for (const k of Object.keys(p)) if (!PHRASE_KEYS.includes(k)) errors.push(`${at}: clave desconocida «${k}»`);
    if (!kinds.has(p.kind)) errors.push(`${at}: tipo desconocido «${p.kind}»`);
    if (p.base !== undefined && !(typeof p.base === 'number' && p.base > 0)) errors.push(`${at}: \`base\` debe ser mayor que 0`);
    if (p.cooldownMinutes !== undefined && !(typeof p.cooldownMinutes === 'number' && p.cooldownMinutes >= 1)) errors.push(`${at}: \`cooldownMinutes\` debe ser al menos 1`);
    for (const [d, w] of Object.entries(p.weights || {})) {
      if (!dims.includes(d) || typeof w !== 'number') errors.push(`${at}: peso inválido «${d}»`);
    }
    for (const group of ['all', 'any', 'none']) {
      const g = p.when && p.when[group];
      if (g === undefined) continue;
      if (!Array.isArray(g)) errors.push(`${at}: \`when.${group}\` debe ser una lista`);
      else for (const flag of g) if (!flags.has(flag)) errors.push(`${at}: señal desconocida «${flag}»`);
    }
    for (const k of Object.keys(p.when || {})) if (!['all', 'any', 'none'].includes(k)) errors.push(`${at}: condición desconocida «${k}»`);

    let reference = null;
    for (const lang of langs) {
      const text = p.text && p.text[lang];
      if (typeof text !== 'string' || !text.trim()) {
        errors.push(`${at}: falta el texto en ${lang}`);
        continue;
      }
      for (const bad of malformedVariables(text)) errors.push(`${at} (${lang}): variable mal escrita «${bad}»`);
      // Llaves sueltas: casi seguro una variable a medio escribir
      if (/(^|[^{])\{(?!\{)|(^|[^}])\}(?!\})/.test(text.replace(VARIABLE, ''))) errors.push(`${at} (${lang}): llave suelta; las variables van entre llaves dobles`);
      const used = variablesOf(text);
      for (const name of used) if (!(name in variables)) errors.push(`${at} (${lang}): variable no declarada «${name}»`);
      const key = [...used].sort().join(',');
      if (reference === null) reference = key;
      else if (reference !== key) errors.push(`${at}: los idiomas no usan las mismas variables`);
      if (text.length > 160) errors.push(`${at} (${lang}): demasiado larga para un bocadillo (máx. 160)`);
    }
  }
  // Siempre debe poder decir algo: al menos una frase sin condiciones y sin datos aprendidos
  const always = list.some((p) => p && !p.when && variablesOf((p.text && p.text[langs[0]]) || '').every((n) => variables[n] && (variables[n].source === 'owner' || variables[n].source === 'pet')));
  if (list.length && !always) errors.push(`${where}: hace falta una frase sin condiciones que no dependa de datos aprendidos`);
  return errors;
}

module.exports = { validatePhrases, variablesOf, malformedVariables };
