/**
 * Dialogue Engine (spec 37 §5.2) — funciones puras.
 *
 * Intérprete de conversaciones sin LLM sobre un grafo de datos
 * (`shared/game-data/dialogues.json`). No es un lenguaje de guiones: nodos, opciones, condiciones
 * y asignaciones, nada más.
 *
 * Un nodo es **una** de estas cosas:
 * - una línea (`speaker` + `line`), que continúa con `next` o termina con `end`;
 * - un conjunto de opciones (`choices`);
 * - un salto (`next`), que puede ser condicional: la primera transición cuyo `if` se cumple;
 * - el final (`end`).
 *
 * Los costes y efectos van en la **transición** (una opción o un salto), nunca en el nodo: un nodo
 * al que se vuelve no cobra ni premia otra vez.
 *
 * El intérprete no escribe en la base de datos ni emite eventos: devuelve las líneas, las opciones
 * visibles y los comandos pendientes, y el servicio decide qué hacer con ellos. `line` y `text`
 * son siempre IDs de `shared/game-data/strings`, nunca texto.
 */

export type Value = number | boolean | string;
export type Vars = Record<string, Value>;

export interface Transition {
  to: string;
  /** Condición (expresión de lista blanca). Sin ella, la transición vale siempre. */
  if?: string;
  /** Asignaciones: variable → expresión. */
  set?: Record<string, string>;
  /** Comandos que se piden al servicio al tomar esta transición. */
  cmd?: string[];
}

export interface Choice extends Transition {
  /** ID de la línea que se muestra como opción. */
  text: string;
}

export interface DialogueNode {
  speaker?: string;
  line?: string;
  choices?: Choice[];
  next?: string | Transition[];
  end?: boolean;
}

export interface Dialogue {
  start: string;
  /** Variables declaradas con su valor inicial. Toda variable usada debe estar aquí. */
  vars: Vars;
  nodes: Record<string, DialogueNode>;
}

export interface DialogueState {
  dialogue: string;
  /** Nodo de opciones en el que se espera una elección; `null` si ha terminado. */
  node: string | null;
  vars: Vars;
  ended: boolean;
}

export interface SpokenLine {
  speaker: string;
  line: string;
}

export interface VisibleChoice {
  /** Índice que envía el cliente: posición entre las opciones **visibles**. */
  index: number;
  text: string;
}

export interface DialogueStep {
  state: DialogueState;
  lines: SpokenLine[];
  choices: VisibleChoice[];
  /** Comandos de las transiciones tomadas en este paso, en orden. */
  commands: string[];
}

/** Comandos que un grafo puede pedir (catálogo cerrado, §5.4). */
export const COMMANDS = ['behavior', 'feel', 'remember', 'take_item', 'wish_done'] as const;
export type CommandName = (typeof COMMANDS)[number];

export function parseCommand(cmd: string): { name: CommandName; arg: string } | null {
  const at = cmd.indexOf(':');
  if (at <= 0) return null;
  const name = cmd.slice(0, at);
  const arg = cmd.slice(at + 1);
  return (COMMANDS as readonly string[]).includes(name) && arg ? { name: name as CommandName, arg } : null;
}

// ── Expresiones ─────────────────────────────────────────────────────────────
//
// Lista blanca: números, `true`/`false`, cadenas entre comillas simples, variables declaradas,
// comparaciones, `and`/`or`/`not`, suma, resta y paréntesis. No hay llamadas, ni propiedades, ni
// índices: cualquier otra cosa es un error al analizar, no al ejecutar.

export type Expr =
  | { k: 'lit'; v: Value }
  | { k: 'var'; name: string }
  | { k: 'not'; a: Expr }
  | { k: 'neg'; a: Expr }
  | { k: 'bin'; op: string; a: Expr; b: Expr };

const TOKEN = /\s*(?:(\d+(?:\.\d+)?)|'([^'\\]*)'|([A-Za-z_][A-Za-z0-9_]*)|(==|!=|<=|>=|[<>+\-()]))/y;
const KEYWORDS = new Set(['and', 'or', 'not', 'true', 'false']);

interface Token {
  t: 'num' | 'str' | 'id' | 'op';
  v: string;
}

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  TOKEN.lastIndex = 0;
  let pos = 0;
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(src);
    if (!m) throw new Error(`Expresión no permitida: «${src}» (cerca de «${src.slice(pos, pos + 12).trim()}»)`);
    if (m[1] !== undefined) out.push({ t: 'num', v: m[1] });
    else if (m[2] !== undefined) out.push({ t: 'str', v: m[2] });
    else if (m[3] !== undefined) out.push({ t: 'id', v: m[3] });
    else out.push({ t: 'op', v: m[4] });
    pos = TOKEN.lastIndex;
  }
  return out;
}

/**
 * Analiza una expresión. `declared` son las variables que existen: usar otra es un error.
 * Precedencia, de menor a mayor: `or`, `and`, `not`, comparación, suma y resta.
 */
export function parseExpr(src: string, declared: ReadonlySet<string>): Expr {
  if (typeof src !== 'string' || !src.trim()) throw new Error('Expresión vacía');
  const tokens = tokenize(src);
  let i = 0;
  const peek = () => tokens[i];
  const isOp = (v: string) => peek()?.t === 'op' && peek().v === v;
  const isWord = (v: string) => peek()?.t === 'id' && peek().v === v;

  const primary = (): Expr => {
    const tok = tokens[i++];
    if (!tok) throw new Error(`Expresión incompleta: «${src}»`);
    if (tok.t === 'num') return { k: 'lit', v: Number(tok.v) };
    if (tok.t === 'str') return { k: 'lit', v: tok.v };
    if (tok.t === 'op' && tok.v === '(') {
      const e = or();
      if (!isOp(')')) throw new Error(`Falta «)» en «${src}»`);
      i++;
      return e;
    }
    if (tok.t === 'op' && tok.v === '-') return { k: 'neg', a: primary() };
    if (tok.t === 'id') {
      if (tok.v === 'true' || tok.v === 'false') return { k: 'lit', v: tok.v === 'true' };
      if (KEYWORDS.has(tok.v)) throw new Error(`«${tok.v}» fuera de sitio en «${src}»`);
      if (!declared.has(tok.v)) throw new Error(`Variable no declarada: ${tok.v}`);
      return { k: 'var', name: tok.v };
    }
    throw new Error(`Expresión no permitida: «${src}»`);
  };
  const sum = (): Expr => {
    let a = primary();
    while (isOp('+') || isOp('-')) {
      const op = tokens[i++].v;
      a = { k: 'bin', op, a, b: primary() };
    }
    return a;
  };
  const cmp = (): Expr => {
    const a = sum();
    if (peek()?.t === 'op' && ['==', '!=', '<', '<=', '>', '>='].includes(peek().v)) {
      const op = tokens[i++].v;
      return { k: 'bin', op, a, b: sum() };
    }
    return a;
  };
  const not = (): Expr => {
    if (isWord('not')) {
      i++;
      return { k: 'not', a: not() };
    }
    return cmp();
  };
  const and = (): Expr => {
    let a = not();
    while (isWord('and')) {
      i++;
      a = { k: 'bin', op: 'and', a, b: not() };
    }
    return a;
  };
  function or(): Expr {
    let a = and();
    while (isWord('or')) {
      i++;
      a = { k: 'bin', op: 'or', a, b: and() };
    }
    return a;
  }

  const e = or();
  if (i < tokens.length) throw new Error(`Expresión no permitida: «${src}» (sobra «${tokens[i].v}»)`);
  return e;
}

const num = (v: Value, src: string): number => {
  if (typeof v !== 'number') throw new Error(`Se esperaba un número en «${src}»`);
  return v;
};

function run(e: Expr, vars: Vars, src: string): Value {
  switch (e.k) {
    case 'lit':
      return e.v;
    case 'var':
      return vars[e.name];
    case 'not':
      return !run(e.a, vars, src);
    case 'neg':
      return -num(run(e.a, vars, src), src);
    case 'bin': {
      if (e.op === 'and') return !!run(e.a, vars, src) && !!run(e.b, vars, src);
      if (e.op === 'or') return !!run(e.a, vars, src) || !!run(e.b, vars, src);
      const a = run(e.a, vars, src);
      const b = run(e.b, vars, src);
      if (e.op === '==') return a === b;
      if (e.op === '!=') return a !== b;
      if (e.op === '+') return num(a, src) + num(b, src);
      if (e.op === '-') return num(a, src) - num(b, src);
      const x = num(a, src);
      const y = num(b, src);
      return e.op === '<' ? x < y : e.op === '<=' ? x <= y : e.op === '>' ? x > y : x >= y;
    }
  }
}

/** Evalúa una expresión con las variables dadas (que son, además, las únicas declaradas). */
export function evaluate(src: string, vars: Vars): Value {
  return run(parseExpr(src, new Set(Object.keys(vars))), vars, src);
}

// ── Intérprete ──────────────────────────────────────────────────────────────

/** Saltos seguidos que se admiten en un paso: un grafo válido no se acerca; un bucle sin opciones, sí. */
const MAX_HOPS = 64;

const holds = (t: Transition, vars: Vars) => t.if === undefined || !!evaluate(t.if, vars);

function take(t: Transition, vars: Vars, commands: string[]): Vars {
  let next = vars;
  if (t.set) {
    // Todas las asignaciones de una transición leen el estado anterior a ella
    const updates: Vars = {};
    for (const [name, expr] of Object.entries(t.set)) {
      if (!(name in vars)) throw new Error(`Variable no declarada: ${name}`);
      updates[name] = evaluate(expr, vars);
    }
    next = { ...vars, ...updates };
  }
  if (t.cmd) commands.push(...t.cmd);
  return next;
}

/** Opciones visibles ahora en un nodo, con la opción original de cada una. */
export function visibleChoices(node: DialogueNode, vars: Vars): Choice[] {
  return (node.choices ?? []).filter((c) => holds(c, vars));
}

/** Avanza desde `nodeId` hasta que haya que elegir o se acabe, recogiendo líneas y comandos. */
function advance(dialogue: Dialogue, id: string, nodeId: string, vars: Vars, commands: string[]): DialogueStep {
  const lines: SpokenLine[] = [];
  let current: string | null = nodeId;
  let state = vars;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const node: DialogueNode | undefined = current === null ? undefined : dialogue.nodes[current];
    if (!node) throw new Error(`Nodo desconocido: ${current}`);
    if (node.line) lines.push({ speaker: node.speaker ?? 'pet', line: node.line });
    if (node.choices) {
      const visible = visibleChoices(node, state);
      // Un menú sin ninguna opción visible sería un callejón sin salida: se da por terminado
      if (!visible.length) return { state: { dialogue: id, node: null, vars: state, ended: true }, lines, choices: [], commands };
      return {
        state: { dialogue: id, node: current, vars: state, ended: false },
        lines,
        choices: visible.map((c, index) => ({ index, text: c.text })),
        commands,
      };
    }
    if (node.end || node.next === undefined) return { state: { dialogue: id, node: null, vars: state, ended: true }, lines, choices: [], commands };
    if (typeof node.next === 'string') {
      current = node.next;
      continue;
    }
    const t: Transition | undefined = node.next.find((x) => holds(x, state));
    if (!t) return { state: { dialogue: id, node: null, vars: state, ended: true }, lines, choices: [], commands };
    state = take(t, state, commands);
    current = t.to;
  }
  throw new Error(`La conversación «${id}» no llega a ninguna opción ni a un final`);
}

/**
 * Empieza una conversación. `vars` da valor a variables **declaradas** (las demás conservan su
 * valor inicial); pasar una que no existe es un error.
 */
export function start(dialogues: Record<string, Dialogue>, dialogueId: string, vars: Vars = {}): DialogueStep {
  const dialogue = dialogues[dialogueId];
  if (!dialogue) throw new Error(`Conversación desconocida: ${dialogueId}`);
  for (const name of Object.keys(vars)) if (!(name in dialogue.vars)) throw new Error(`Variable no declarada: ${name}`);
  return advance(dialogue, dialogueId, dialogue.start, { ...dialogue.vars, ...vars }, []);
}

/**
 * Elige una opción por su índice entre las visibles. `fresh` permite refrescar variables de solo
 * lectura que hayan cambiado desde el paso anterior (p. ej. la energía de la mascota).
 * Devuelve `null` si el índice no corresponde a ninguna opción visible.
 */
export function choose(dialogues: Record<string, Dialogue>, state: DialogueState, index: number, fresh: Vars = {}): DialogueStep | null {
  const dialogue = dialogues[state.dialogue];
  if (!dialogue || state.ended || state.node === null) return null;
  for (const name of Object.keys(fresh)) if (!(name in dialogue.vars)) throw new Error(`Variable no declarada: ${name}`);
  const vars = { ...state.vars, ...fresh };
  const node = dialogue.nodes[state.node];
  const choice = node ? visibleChoices(node, vars)[index] : undefined;
  if (!choice || !Number.isInteger(index)) return null;
  const commands: string[] = [];
  return advance(dialogue, state.dialogue, choice.to, take(choice, vars, commands), commands);
}
