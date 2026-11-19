import * as fs from 'fs';
import * as path from 'path';
import { promptHint, viewOf, BEHAVIORS } from './behavior.engine';
import { interpretMessage } from './conversation.engine';
import { COMMANDS, Dialogue, DialogueStep, Vars, choose, evaluate, parseCommand, parseExpr, start } from './dialogue.engine';
import { LANGS, PLACEHOLDERS, hasText, sanitizeParam, text, textIds, variants } from './strings';
import { InteractionEngineService, sceneNote } from '../buddies/interaction-engine.service';

const root = path.resolve(__dirname, '../../../..');
const json = (rel: string) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const balance = json('shared/game-data/balance.json');
const data = json('shared/game-data/dialogues.json');
const conversations = data.conversations as Record<string, Dialogue>;
// La misma validación que ejecuta `pnpm validate:data`
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { validateDialogues, checkExpr, COMMANDS: JS_COMMANDS } = require(path.join(root, 'scripts/lib/validate-dialogues.js'));

const pers = balance.personality;
const validatorInput = (dialogues: unknown = data, strings?: Record<string, Record<string, string>>) => ({
  dialogues,
  strings: strings ?? { es: json('shared/game-data/strings/es.json'), en: json('shared/game-data/strings/en.json') },
  keywords: Object.values(pers.dimensions).flatMap((d: any) => d.bands.map((b: any) => b.keyword)),
  behaviors: Object.keys(pers.behavior.catalog),
  wishes: Object.keys(pers.wishes.catalog),
  placeholders: [...PLACEHOLDERS],
});
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
/** Errores de validar los datos reales con una conversación `visit` modificada. */
const broken = (mutate: (visit: any, all: any) => void, strings?: (s: Record<string, Record<string, string>>) => void): string[] => {
  const d = clone(data);
  mutate(d.conversations.visit, d);
  const input = validatorInput(d);
  strings?.(input.strings);
  return validateDialogues(input);
};

describe('Textos por datos (spec 37 §5.1)', () => {
  it('los datos reales son válidos', () => {
    expect(validateDialogues(validatorInput())).toEqual([]);
  });

  it('los dos idiomas tienen los mismos ids', () => {
    expect(LANGS).toEqual(['es', 'en']);
    expect(textIds('en').sort()).toEqual(textIds('es').sort());
  });

  it('elige la variante del carácter actual y cae a la base', () => {
    const base = text('DLG_VISIT_GREET', { pet: 'Lumo' });
    expect(base).toBe('Lumo te saluda contento.');
    expect(text('DLG_VISIT_GREET', { pet: 'Lumo' }, { keywords: ['curious', 'outgoing'] })).toBe('Lumo te recibe como si llevara todo el día esperándote.');
    expect(text('DLG_VISIT_GREET', { pet: 'Lumo' }, { keywords: ['curious', 'friendly'] })).toBe(base);
    expect(text('DLG_VISIT_GREET', { pet: 'Lumo' }, { lang: 'en', keywords: ['outgoing'] })).toContain('all day');
  });

  it('solo interpola nombres permitidos, y saneados', () => {
    expect(text('DLG_VISIT_TREAT', { pet: 'Lu{mo}\n', item: '  Manzana  ' })).toBe('Lu mo acepta Manzana encantado.');
    expect(sanitizeParam('a{b}c\u0007d', 4)).toBe('a b');
    // Un hueco sin valor se queda como está: no se rellena con «undefined»
    expect(text('DLG_VISIT_TREAT', { pet: 'Lumo' })).toContain('{item}');
  });

  it('un id que no existe es un error de datos, no un texto vacío', () => {
    expect(() => text('NO_EXISTE')).toThrow('Línea de texto desconocida');
    expect(() => variants('NO_EXISTE')).toThrow();
    expect(hasText('NO_EXISTE')).toBe(false);
  });
});

describe('Migración de las frases (spec 37 §5.6): mismo texto, ahora desde datos', () => {
  it('las frases en castellano no han cambiado', () => {
    expect(variants('AUTO_SLEEP')).toEqual(['Dormí profundamente y soñé con el Éter.', 'Me eché una siesta larguísima.']);
    expect(interpretMessage('te quiero mucho').episode?.content).toBe('Mi entrenador me dijo que me quiere.');
    expect(promptHint(viewOf('comfort'))).toBe('Reacción decidida para este mensaje: Consuela a tu entrenador con calidez y dile que estás a su lado.');
    expect(new InteractionEngineService().effectsFor('chase').note).toBe('¡Espera!');
    expect(sceneNote('play_tag')).toBe('¡A que no me pillas!');
  });

  it('todas las reacciones tienen su pista en los dos idiomas', () => {
    for (const action of BEHAVIORS) for (const lang of LANGS) expect(hasText(`HINT_${action.toUpperCase()}`, lang)).toBe(true);
  });

  it('no queda ninguna frase mostrable de los cuatro orígenes en el código', () => {
    const src = (rel: string) => fs.readFileSync(path.join(root, 'backend/src/modules', rel), 'utf8');
    const autonomy = src('mind/autonomy.engine.ts');
    const conversation = src('mind/conversation.engine.ts');
    const behavior = src('mind/behavior.engine.ts');
    const buddies = src('buddies/interaction-engine.service.ts');
    expect(autonomy).not.toMatch(/const TEXTS\b/);
    expect(behavior).not.toMatch(/PROMPT_HINT/);
    expect(buddies).not.toMatch(/SCENE_NOTE:/);
    // Ningún texto de la tabla de castellano aparece literal en esos archivos
    const es = json('shared/game-data/strings/es.json') as Record<string, string>;
    for (const [id, value] of Object.entries(es)) {
      if (!/^(AUTO_|EP_|HINT_|BUDDY_NOTE_|SCENE_NOTE_)/.test(id) || value.length < 8) continue;
      const literal = value.replace(/\{\w+\}.*$/, '');
      if (literal.length < 8) continue;
      for (const file of [autonomy, conversation, behavior, buddies]) expect(file.includes(literal)).toBe(false);
    }
  });
});

describe('Expresiones de lista blanca (spec 37 §5.2)', () => {
  const vars: Vars = { count: 2, max: 5, shy: true, knows: false, mood: 'fine' };

  it('comparaciones, and/or/not, suma y resta sobre variables declaradas', () => {
    expect(evaluate('count < max', vars)).toBe(true);
    expect(evaluate('count + 3 >= max', vars)).toBe(true);
    expect(evaluate('shy and not knows', vars)).toBe(true);
    expect(evaluate('not (shy or knows)', vars)).toBe(false);
    expect(evaluate('count - 1', vars)).toBe(1);
    expect(evaluate("mood == 'fine'", vars)).toBe(true);
    expect(evaluate('-count + 2 == 0', vars)).toBe(true);
    expect(evaluate('true', vars)).toBe(true);
  });

  const forbidden = [
    'count.toString()',
    'process.exit(1)',
    'vars[0]',
    'count * 2',
    'count / 2',
    'count ? 1 : 2',
    'a = 1',
    'count; count',
    'require("fs")',
    'count && max',
    '`${count}`',
    'constructor',
    'undeclared > 1',
    'count <',
    '(count',
    'not',
    '',
  ];
  it.each(forbidden)('rechaza «%s»', (src) => {
    expect(() => evaluate(src, vars)).toThrow();
    // El validador de datos rechaza exactamente lo mismo: el error se ve antes de desplegar
    expect(checkExpr(src, new Set(Object.keys(vars)))).not.toBeNull();
  });

  it('el validador de datos y el intérprete aceptan las mismas expresiones', () => {
    const declared = new Set(Object.keys(vars));
    for (const ok of ['count < max', 'shy and not knows', "mood != 'x'", '(count + 1) - 2 <= max', 'not not shy', 'true or false']) {
      expect(checkExpr(ok, declared)).toBeNull();
      expect(() => parseExpr(ok, declared)).not.toThrow();
    }
    expect(JS_COMMANDS).toEqual([...COMMANDS]);
  });

  it('sumar algo que no es un número es un error, no una concatenación', () => {
    expect(() => evaluate('mood + 1', vars)).toThrow('número');
    expect(() => evaluate('shy < 2', vars)).toThrow('número');
  });
});

describe('Validación de diálogos (spec 37 §5.5): un test por tipo de error', () => {
  const has = (errors: string[], fragment: string) => expect(errors.join('\n')).toContain(fragment);

  it('destino que no existe', () => has(broken((v) => (v.nodes.greeted.next = 'nowhere')), 'el destino «nowhere» no existe'));
  it('destino de una opción que no existe', () => has(broken((v) => (v.nodes.menu.choices[0].to = 'nowhere')), 'el destino «nowhere» no existe'));
  it('nodo sin salida', () => has(broken((v) => delete v.nodes.greeted.next), 'nodo sin salida'));
  it('variable no declarada en una condición', () => has(broken((v) => (v.nodes.menu.choices[0].if = 'ghost > 1')), 'variable no declarada «ghost»'));
  it('variable no declarada en una asignación', () => has(broken((v) => (v.nodes.menu.choices[0].set = { ghost: '1' })), 'variable no declarada «ghost»'));
  it('nodo inalcanzable', () => has(broken((v) => (v.nodes.orphan = { speaker: 'pet', line: 'DLG_VISIT_BYE', end: true })), 'nodo inalcanzable'));
  it('línea sin texto', () => has(broken((v) => (v.nodes.greeted.line = 'DLG_NO_EXISTE')), 'no tiene texto en todos los idiomas'));
  it('línea sin texto en un idioma', () => has(broken(() => undefined, (s) => delete s.en.DLG_VISIT_GREET), 'strings/en.json: falta el texto de «DLG_VISIT_GREET»'));
  it('opción sin texto', () => has(broken((v) => (v.nodes.menu.choices[0].text = 'DLG_NO_EXISTE')), 'no tiene línea en todos los idiomas'));
  it('comando fuera de catálogo', () => has(broken((v) => (v.nodes.menu.choices[0].cmd = ['give_coins:100'])), 'comando fuera de catálogo «give_coins:100»'));
  it('reacción que no está en el catálogo', () => has(broken((v) => (v.nodes.menu.choices[0].cmd = ['behavior:explode'])), 'reacción desconocida «explode»'));
  it('efecto fuera de sus límites', () => has(broken((v) => (v.nodes.menu.choices[0].cmd = ['feel:0.9'])), 'debe estar entre'));
  it('expresión con una función', () => has(broken((v) => (v.nodes.menu.choices[0].if = 'count.toFixed(1) > 0')), 'expresión no permitida'));
  it('nodo inicial que no existe', () => has(broken((v) => (v.start = 'nowhere')), 'el nodo inicial «nowhere» no existe'));
  it('bucle de saltos sin opciones', () => has(broken((v) => (v.nodes.greeted.next = 'greeted')), 'bucle de saltos'));
  it('último salto condicional', () => has(broken((v) => (v.nodes.after.next[1].if = 'count < max')), 'el último salto debe ser incondicional'));
  it('interpolación no permitida', () => has(broken(() => undefined, (s) => (s.es.DLG_VISIT_GREET = '{pet} dice {password}')), 'interpola «{password}»'));
  it('variante de un carácter que no existe', () => has(broken(() => undefined, (s) => (s.es['DLG_VISIT_GREET@grumpy'] = s.en['DLG_VISIT_GREET@grumpy'] = 'x')), 'palabra clave de carácter desconocida'));
  it('un idioma que interpola otra cosa', () => has(broken(() => undefined, (s) => (s.en.DLG_VISIT_TREAT = '{pet} accepts it.')), 'no interpola lo mismo'));

  it('pnpm validate:data falla con un grafo roto', () => {
    // El script lanza con la lista de errores: aquí se comprueba el mismo camino que usa
    const errors = broken((v) => (v.nodes.greeted.next = 'nowhere'));
    expect(errors.length).toBeGreaterThan(0);
    const script = fs.readFileSync(path.join(root, 'scripts/validate-game-data.js'), 'utf8');
    expect(script).toContain("require('./lib/validate-dialogues')");
    expect(script).toMatch(/if \(errors\.length\) throw new Error/);
  });
});

describe('Intérprete (spec 37 §5.2 a §5.4)', () => {
  const run = (vars: Vars = {}) => start(conversations, 'visit', vars);
  const pick = (step: DialogueStep, textId: string, fresh: Vars = {}) => {
    const index = step.choices.findIndex((c) => c.text === textId);
    if (index < 0) throw new Error(`no hay opción ${textId}: ${step.choices.map((c) => c.text)}`);
    return choose(conversations, step.state, index, fresh)!;
  };

  it('empieza con la línea de bienvenida, las opciones visibles y la reacción pedida', () => {
    const s = run({ has_treat: true });
    expect(s.lines).toEqual([{ speaker: 'pet', line: 'DLG_VISIT_OPEN' }]);
    expect(s.choices.map((c) => c.text)).toEqual(['DLG_OPT_GREET', 'DLG_OPT_PET', 'DLG_OPT_TREAT', 'DLG_OPT_PLAY', 'DLG_OPT_ASK', 'DLG_OPT_BYE']);
    expect(s.choices.map((c) => c.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(s.commands).toEqual(['behavior:greet_visitor']);
  });

  it('un tímido ante un desconocido se esconde y solo deja esperar; a un conocido le recibe', () => {
    const shy = run({ shy: true });
    expect(shy.commands).toEqual(['behavior:hide']);
    expect(shy.choices.map((c) => c.text)).toEqual(['DLG_OPT_WAIT', 'DLG_OPT_BYE']);
    expect(pick(shy, 'DLG_OPT_WAIT').choices.map((c) => c.text)).toContain('DLG_OPT_GREET');
    expect(run({ shy: true, knows: true }).commands).toEqual(['behavior:greet_visitor']);
  });

  it('la misma opción lleva a sitios distintos según el estado, sin duplicar el menú', () => {
    expect(pick(run({ aloof: true }), 'DLG_OPT_PET').lines[0].line).toBe('DLG_VISIT_PET_NO');
    expect(pick(run({ aloof: true, knows: true }), 'DLG_OPT_PET').lines[0].line).toBe('DLG_VISIT_PET_OK');
    expect(pick(run({ energy: 5 }), 'DLG_OPT_PLAY').commands).toEqual(['behavior:yawn']);
    // Solo aparece una vez en el menú, sea cual sea la rama
    expect(run({ aloof: true }).choices.filter((c) => c.text === 'DLG_OPT_PET')).toHaveLength(1);
  });

  it('el coste de una opción se cobra una vez aunque el nodo de destino se revisite', () => {
    let step = run({ has_treat: true });
    const commands: string[] = [...step.commands];
    step = pick(step, 'DLG_OPT_TREAT');
    commands.push(...step.commands);
    // Vuelve al menú (nodo revisitado) varias veces
    for (const next of ['DLG_OPT_GREET', 'DLG_OPT_PET', 'DLG_OPT_PLAY']) {
      expect(step.choices.map((c) => c.text)).not.toContain('DLG_OPT_TREAT');
      step = pick(step, next);
      commands.push(...step.commands);
    }
    expect(commands.filter((c) => c === 'take_item:visitor')).toHaveLength(1);
    expect(commands.filter((c) => c === 'remember:DLG_VISIT_EP_TREAT')).toHaveLength(1);
    // El nodo en sí no pide nada: los comandos venían de la transición
    expect(conversations.visit.nodes.treated).toEqual({ speaker: 'pet', line: 'DLG_VISIT_TREAT', next: 'after' });
  });

  it('al llegar al tope lo dice y solo queda despedirse', () => {
    let step = run({ max: 2 });
    step = pick(step, 'DLG_OPT_GREET');
    step = pick(step, 'DLG_OPT_PET');
    expect(step.lines.map((l) => l.line)).toEqual(['DLG_VISIT_PET_OK', 'DLG_VISIT_LIMIT']);
    expect(step.choices.map((c) => c.text)).toEqual(['DLG_OPT_BYE']);
    const end = pick(step, 'DLG_OPT_BYE');
    expect(end.state).toMatchObject({ ended: true, node: null });
    expect(choose(conversations, end.state, 0)).toBeNull();
  });

  it('el cliente envía un índice entre las opciones visibles; uno que no existe no hace nada', () => {
    const s = run();
    expect(choose(conversations, s.state, 99)).toBeNull();
    expect(choose(conversations, s.state, -1)).toBeNull();
    expect(choose(conversations, s.state, 1.5)).toBeNull();
  });

  it('las variables que cambian fuera (la energía) se pueden refrescar; las no declaradas, no', () => {
    const s = run({ energy: 80 });
    expect(pick(s, 'DLG_OPT_PLAY', { energy: 3 }).lines[0].line).toBe('DLG_VISIT_PLAY_TIRED');
    expect(() => run({ ghost: 1 })).toThrow('Variable no declarada');
    expect(() => choose(conversations, s.state, 0, { ghost: 1 })).toThrow('Variable no declarada');
    expect(() => start(conversations, 'no_existe')).toThrow('Conversación desconocida');
  });

  it('es determinista y no modifica el estado recibido', () => {
    const s = run({ has_treat: true });
    const frozen = JSON.stringify(s.state);
    expect(choose(conversations, s.state, 2)).toEqual(choose(conversations, s.state, 2));
    expect(JSON.stringify(s.state)).toBe(frozen);
  });

  it('todos los comandos del grafo son del catálogo', () => {
    for (const d of Object.values(conversations)) {
      for (const node of Object.values(d.nodes)) {
        const transitions = [...(node.choices ?? []), ...(Array.isArray(node.next) ? node.next : [])];
        for (const t of transitions) for (const cmd of t.cmd ?? []) expect(parseCommand(cmd)).not.toBeNull();
      }
    }
    expect(parseCommand('give_coins:100')).toBeNull();
    expect(parseCommand('behavior:')).toBeNull();
  });

  /**
   * Recorre TODOS los caminos de cada conversación, eligiendo cada opción visible en orden, y
   * comprueba que terminan. Se repite con varios estados de partida para cubrir las ramas.
   */
  it.each(Object.keys(conversations))('todos los caminos de «%s» terminan', (name) => {
    const presets: Vars[] = [
      {},
      { has_treat: true, has_story: true, knows: true, friends: true },
      { shy: true, aloof: true },
      { sleeping: true },
      { sick: true, has_treat: true },
      { energy: 0, can_effect: false, has_treat: true },
      { max: 1 },
      { max: 0 },
    ];
    let paths = 0;
    let longest = 0;
    const walk = (step: DialogueStep, depth: number) => {
      if (depth > 40) throw new Error(`camino sin final en «${name}»`);
      if (step.state.ended) {
        paths++;
        longest = Math.max(longest, depth);
        return;
      }
      expect(step.choices.length).toBeGreaterThan(0);
      for (const c of step.choices) walk(choose(conversations, step.state, c.index)!, depth + 1);
    };
    for (const preset of presets) walk(start(conversations, name, preset), 0);
    expect(paths).toBeGreaterThan(100);
    // Nunca más interacciones que el tope, más la espera y la despedida
    expect(longest).toBeLessThanOrEqual(7);
  });
});
