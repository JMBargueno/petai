// Validación de shared/game-data/dialogues.json y strings/<idioma>.json (spec 37 §5.5).
//
// La usa scripts/validate-game-data.js y la prueban los tests del backend
// (mind/dialogue.engine.spec.ts), que además comprueban que acepta y rechaza las mismas
// expresiones que el intérprete (mind/dialogue.engine.ts). Devuelve la lista de errores: vacía si
// todo está bien. No lanza, para poder enseñar todos los fallos de una vez.

const COMMANDS = ['behavior', 'feel', 'remember', 'take_item', 'wish_done'];
const ITEM_ORIGINS = ['visitor'];
const SPEAKERS = ['pet', 'friend', 'visitor'];
const NODE_KEYS = ['speaker', 'line', 'choices', 'next', 'end'];
const TRANSITION_KEYS = ['to', 'if', 'set', 'cmd', 'text'];
const MAX_FEEL = 0.3;

// ── Expresiones: la misma lista blanca que el intérprete ───────────────────
const TOKEN = /\s*(?:(\d+(?:\.\d+)?)|'([^'\\]*)'|([A-Za-z_][A-Za-z0-9_]*)|(==|!=|<=|>=|[<>+\-()]))/y;
const KEYWORDS = new Set(['and', 'or', 'not', 'true', 'false']);
const COMPARE = ['==', '!=', '<', '<=', '>', '>='];

/** Devuelve `null` si la expresión es válida, o el motivo por el que no lo es. */
function checkExpr(src, declared) {
  if (typeof src !== 'string' || !src.trim()) return 'expresión vacía';
  const tokens = [];
  let pos = 0;
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(src);
    if (!m) return `expresión no permitida «${src}»`;
    if (m[1] !== undefined) tokens.push({ t: 'num', v: m[1] });
    else if (m[2] !== undefined) tokens.push({ t: 'str', v: m[2] });
    else if (m[3] !== undefined) tokens.push({ t: 'id', v: m[3] });
    else tokens.push({ t: 'op', v: m[4] });
    pos = TOKEN.lastIndex;
  }
  let i = 0;
  let error = null;
  const fail = (msg) => {
    if (!error) error = msg;
  };
  const isOp = (v) => tokens[i] && tokens[i].t === 'op' && tokens[i].v === v;
  const isWord = (v) => tokens[i] && tokens[i].t === 'id' && tokens[i].v === v;
  const primary = () => {
    const tok = tokens[i++];
    if (!tok) return fail(`expresión incompleta «${src}»`);
    if (tok.t === 'num' || tok.t === 'str') return;
    if (tok.t === 'op' && tok.v === '(') {
      or();
      if (!isOp(')')) return fail(`falta «)» en «${src}»`);
      i++;
      return;
    }
    if (tok.t === 'op' && tok.v === '-') return primary();
    if (tok.t === 'id') {
      if (tok.v === 'true' || tok.v === 'false') return;
      if (KEYWORDS.has(tok.v)) return fail(`«${tok.v}» fuera de sitio en «${src}»`);
      if (!declared.has(tok.v)) return fail(`variable no declarada «${tok.v}»`);
      return;
    }
    return fail(`expresión no permitida «${src}»`);
  };
  const sum = () => {
    primary();
    while (!error && (isOp('+') || isOp('-'))) {
      i++;
      primary();
    }
  };
  const cmp = () => {
    sum();
    if (!error && tokens[i] && tokens[i].t === 'op' && COMPARE.includes(tokens[i].v)) {
      i++;
      sum();
    }
  };
  const not = () => {
    if (isWord('not')) {
      i++;
      return not();
    }
    cmp();
  };
  const and = () => {
    not();
    while (!error && isWord('and')) {
      i++;
      not();
    }
  };
  function or() {
    and();
    while (!error && isWord('or')) {
      i++;
      and();
    }
  }
  or();
  if (!error && i < tokens.length) fail(`expresión no permitida «${src}» (sobra «${tokens[i].v}»)`);
  return error;
}

/**
 * @param {object} input
 * @param {object} input.dialogues   contenido de dialogues.json
 * @param {Record<string, Record<string,string>>} input.strings   idioma → (id → texto)
 * @param {string[]} input.keywords  palabras clave de banda (para las variantes `ID@clave`)
 * @param {string[]} input.behaviors reacciones del catálogo
 * @param {string[]} input.wishes    deseos del catálogo
 * @param {string[]} input.placeholders nombres que una línea puede interpolar
 * @returns {string[]} errores
 */
function validateDialogues(input) {
  const errors = [];
  const { dialogues, strings, keywords = [], behaviors = [], wishes = [], placeholders = [] } = input;
  const langs = Object.keys(strings || {});
  if (!langs.length) return ['strings: no hay ningún idioma'];
  const base = strings[langs[0]];

  // ── Textos ──
  for (const lang of langs) {
    for (const [id, value] of Object.entries(strings[lang])) {
      if (typeof value !== 'string' || !value.trim()) errors.push(`strings/${lang}.json: «${id}» está vacío`);
      if (!/^[A-Z][A-Z0-9_]*(@[a-z_]+)?$/.test(id)) errors.push(`strings/${lang}.json: id mal formado «${id}»`);
      const at = id.indexOf('@');
      if (at > 0) {
        if (!(id.slice(0, at) in strings[lang])) errors.push(`strings/${lang}.json: la variante «${id}» no tiene línea base`);
        if (!keywords.includes(id.slice(at + 1))) errors.push(`strings/${lang}.json: «${id}» usa una palabra clave de carácter desconocida`);
      }
      for (const m of String(value).matchAll(/\{(\w*)\}/g)) {
        if (!placeholders.includes(m[1])) errors.push(`strings/${lang}.json: «${id}» interpola «{${m[1]}}», que no está permitido`);
      }
    }
  }
  // Cada id existe en todos los idiomas, con los mismos huecos
  const holes = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const lang of langs) {
    for (const id of Object.keys(strings[lang])) {
      for (const other of langs) {
        if (!(id in strings[other])) errors.push(`strings/${other}.json: falta el texto de «${id}»`);
        else if (other !== lang && lang === langs[0] && holes(strings[lang][id]) !== holes(strings[other][id])) {
          errors.push(`strings/${other}.json: «${id}» no interpola lo mismo que en ${lang}`);
        }
      }
    }
  }
  const hasLine = (id) => typeof id === 'string' && langs.every((l) => typeof strings[l][id] === 'string');

  // ── Conversaciones ──
  const conversations = (dialogues && dialogues.conversations) || {};
  if (!dialogues || typeof conversations !== 'object') return [...errors, 'dialogues.json: falta `conversations`'];
  for (const [name, d] of Object.entries(conversations)) {
    const where = `dialogues.json › ${name}`;
    if (!d || typeof d !== 'object' || !d.nodes || typeof d.nodes !== 'object') {
      errors.push(`${where}: faltan los nodos`);
      continue;
    }
    const declared = new Set(Object.keys(d.vars || {}));
    for (const [v, value] of Object.entries(d.vars || {})) {
      if (!['number', 'boolean', 'string'].includes(typeof value)) errors.push(`${where}: la variable «${v}» debe ser número, booleano o texto`);
      if (KEYWORDS.has(v)) errors.push(`${where}: «${v}» no puede ser nombre de variable`);
    }
    if (!(d.start in d.nodes)) errors.push(`${where}: el nodo inicial «${d.start}» no existe`);

    const checkTransition = (t, at) => {
      for (const k of Object.keys(t)) if (!TRANSITION_KEYS.includes(k)) errors.push(`${at}: clave desconocida «${k}»`);
      if (!(t.to in d.nodes)) errors.push(`${at}: el destino «${t.to}» no existe`);
      if (t.if !== undefined) {
        const e = checkExpr(t.if, declared);
        if (e) errors.push(`${at}: ${e}`);
      }
      for (const [v, expr] of Object.entries(t.set || {})) {
        if (!declared.has(v)) errors.push(`${at}: variable no declarada «${v}»`);
        const e = checkExpr(expr, declared);
        if (e) errors.push(`${at}: ${e}`);
      }
      if (t.cmd !== undefined && !Array.isArray(t.cmd)) errors.push(`${at}: \`cmd\` debe ser una lista`);
      for (const cmd of Array.isArray(t.cmd) ? t.cmd : []) {
        const sep = typeof cmd === 'string' ? cmd.indexOf(':') : -1;
        const cname = sep > 0 ? cmd.slice(0, sep) : '';
        const arg = sep > 0 ? cmd.slice(sep + 1) : '';
        if (!COMMANDS.includes(cname) || !arg) {
          errors.push(`${at}: comando fuera de catálogo «${cmd}»`);
          continue;
        }
        if (cname === 'behavior' && !behaviors.includes(arg)) errors.push(`${at}: reacción desconocida «${arg}»`);
        if (cname === 'feel' && !(Number.isFinite(Number(arg)) && Math.abs(Number(arg)) <= MAX_FEEL)) errors.push(`${at}: «${cmd}» debe estar entre -${MAX_FEEL} y ${MAX_FEEL}`);
        if (cname === 'remember' && !hasLine(arg)) errors.push(`${at}: «${cmd}» apunta a una línea sin texto`);
        if (cname === 'take_item' && !ITEM_ORIGINS.includes(arg)) errors.push(`${at}: origen de objeto desconocido «${arg}»`);
        if (cname === 'wish_done' && !wishes.includes(arg)) errors.push(`${at}: deseo desconocido «${arg}»`);
      }
    };

    const edges = {};
    for (const [id, node] of Object.entries(d.nodes)) {
      const at = `${where} › ${id}`;
      edges[id] = [];
      if (!node || typeof node !== 'object') {
        errors.push(`${at}: nodo vacío`);
        continue;
      }
      for (const k of Object.keys(node)) if (!NODE_KEYS.includes(k)) errors.push(`${at}: clave desconocida «${k}»`);
      const kinds = ['choices', 'next', 'end'].filter((k) => node[k] !== undefined && node[k] !== false);
      // Sin salida: ni salto, ni opciones, ni final
      if (!kinds.length) errors.push(`${at}: nodo sin salida (ni \`next\`, ni \`choices\`, ni \`end\`)`);
      if (kinds.length > 1) errors.push(`${at}: un nodo solo puede tener una salida (${kinds.join(', ')})`);
      if (node.line !== undefined) {
        if (!hasLine(node.line)) errors.push(`${at}: la línea «${node.line}» no tiene texto en todos los idiomas`);
        if (node.speaker !== undefined && !SPEAKERS.includes(node.speaker)) errors.push(`${at}: hablante desconocido «${node.speaker}»`);
        if (node.choices) errors.push(`${at}: una línea no puede llevar opciones; ponlas en el nodo siguiente`);
      } else if (node.speaker !== undefined) errors.push(`${at}: \`speaker\` sin \`line\``);
      if (node.choices !== undefined) {
        if (!Array.isArray(node.choices) || !node.choices.length) errors.push(`${at}: \`choices\` debe tener al menos una opción`);
        (Array.isArray(node.choices) ? node.choices : []).forEach((c, i) => {
          const cat = `${at} › opción ${i + 1}`;
          if (!hasLine(c.text)) errors.push(`${cat}: el texto «${c.text}» no tiene línea en todos los idiomas`);
          checkTransition(c, cat);
          edges[id].push(c.to);
        });
      }
      if (typeof node.next === 'string') {
        if (!(node.next in d.nodes)) errors.push(`${at}: el destino «${node.next}» no existe`);
        edges[id].push(node.next);
      } else if (Array.isArray(node.next)) {
        if (!node.next.length) errors.push(`${at}: \`next\` vacío`);
        node.next.forEach((t, i) => {
          const tat = `${at} › salto ${i + 1}`;
          if (t.text !== undefined) errors.push(`${tat}: un salto no lleva \`text\``);
          checkTransition(t, tat);
          edges[id].push(t.to);
        });
        // El último salto debe valer siempre: si no, puede no haber por dónde seguir
        const last = node.next[node.next.length - 1];
        if (last && last.if !== undefined) errors.push(`${at}: el último salto debe ser incondicional`);
      } else if (node.next !== undefined) errors.push(`${at}: \`next\` debe ser un nodo o una lista de saltos`);
    }

    // Inalcanzables desde el inicio
    const seen = new Set();
    const queue = d.start in d.nodes ? [d.start] : [];
    while (queue.length) {
      const id = queue.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      for (const to of edges[id] || []) if (to in d.nodes) queue.push(to);
    }
    for (const id of Object.keys(d.nodes)) if (!seen.has(id) && d.start in d.nodes) errors.push(`${where} › ${id}: nodo inalcanzable desde «${d.start}»`);

    // Un ciclo sin ninguna opción dentro no acabaría nunca
    const silent = (id) => (d.nodes[id] && !d.nodes[id].choices ? edges[id] || [] : []);
    const state = {};
    const loops = (id) => {
      if (state[id] === 1) return true;
      if (state[id] === 2) return false;
      state[id] = 1;
      for (const to of silent(id)) if (to in d.nodes && loops(to)) return true;
      state[id] = 2;
      return false;
    };
    for (const id of Object.keys(d.nodes)) {
      if (loops(id)) {
        errors.push(`${where} › ${id}: bucle de saltos sin ninguna opción`);
        break;
      }
    }
  }
  return errors;
}

module.exports = { validateDialogues, checkExpr, COMMANDS };
