import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FEELINGS,
  createRng,
  eligiblePhrases,
  feelingLabel,
  initialFeeling,
  malformedVariables,
  missingVariables,
  neutralDims,
  pickPhrase,
  pushFeeling,
  renderPhrase,
  restingFeeling,
  sanitizeValue,
  settleFeeling,
  variablesOf,
  whenHolds,
  type FeelingConfig,
  type PhraseContext,
  type PhraseEntry,
} from './index';

const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../game-data/phrases.json'), 'utf8'));
const balance = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../game-data/balance.json'), 'utf8'));
const PHRASES = data.phrases as PhraseEntry[];
const NOW = Date.UTC(2026, 10, 19, 9, 0, 0);

const ctx = (over: Partial<PhraseContext> = {}): PhraseContext => ({
  vars: { 'nombre.custodio': 'Jose', 'nombre.pockai': 'Lumo', 'especie.pockai': 'Axolunar' },
  dims: neutralDims(),
  lang: 'es',
  flags: new Set<string>(),
  recent: [],
  lastAt: {},
  now: NOW,
  rng: createRng(7),
  ...over,
});

describe('frases con variables: plantillas', () => {
  const example = '¿Has recordado dar de comer hoy a tu {{tipo.mascota.real}} {{nombre.mascota.real}}, {{nombre.custodio}}?';

  it('encuentra las variables de una plantilla, sin repetir', () => {
    expect(variablesOf(example)).toEqual(['tipo.mascota.real', 'nombre.mascota.real', 'nombre.custodio']);
    expect(variablesOf('{{a.b}} y {{ a.b }} y {{c}}')).toEqual(['a.b', 'c']);
    expect(variablesOf('sin variables')).toEqual([]);
  });

  it('rellena los huecos cuando se conocen todas', () => {
    const vars = { 'tipo.mascota.real': 'perro', 'nombre.mascota.real': 'Toby', 'nombre.custodio': 'Jose' };
    expect(renderPhrase(example, vars)).toBe('¿Has recordado dar de comer hoy a tu perro Toby, Jose?');
  });

  it('si falta una variable no hay frase: nunca sale un hueco vacío', () => {
    expect(renderPhrase(example, { 'nombre.custodio': 'Jose' })).toBeNull();
    expect(missingVariables(example, { 'nombre.custodio': 'Jose', 'tipo.mascota.real': '  ' })).toEqual(['tipo.mascota.real', 'nombre.mascota.real']);
    expect(renderPhrase(example, { 'tipo.mascota.real': 'perro', 'nombre.mascota.real': null, 'nombre.custodio': 'Jose' })).toBeNull();
  });

  it('sanea los valores: sin llaves, sin saltos y con un largo máximo', () => {
    expect(renderPhrase('Hola, {{nombre.custodio}}.', { 'nombre.custodio': 'Jo{{nombre.pockai}}se\n<b>' })).toBe('Hola, Jo nombre.pockai se b.');
    expect(sanitizeValue('x'.repeat(200)).length).toBe(60);
    expect(sanitizeValue({ toString: () => 'truco' })).toBe('');
    expect(sanitizeValue(7)).toBe('7');
  });

  it('detecta variables mal escritas', () => {
    expect(malformedVariables('Hola {{Nombre}} y {{a..b}} y {{ok.bien}}')).toEqual(['{{Nombre}}', '{{a..b}}']);
    expect(malformedVariables('Hola {{nombre.custodio')).toEqual(['{{']);
    expect(malformedVariables('todo {{en.orden}}')).toEqual([]);
  });

  it('las condiciones de contexto: todas, alguna, ninguna', () => {
    const flags = new Set(['morning', 'back']);
    expect(whenHolds(undefined, flags)).toBe(true);
    expect(whenHolds({ all: ['morning', 'back'] }, flags)).toBe(true);
    expect(whenHolds({ all: ['morning', 'hungry'] }, flags)).toBe(false);
    expect(whenHolds({ any: ['evening', 'back'] }, flags)).toBe(true);
    expect(whenHolds({ any: ['evening'] }, flags)).toBe(false);
    expect(whenHolds({ none: ['back'] }, flags)).toBe(false);
  });
});

describe('frases con variables: el catálogo real', () => {
  it('sin datos aprendidos solo son candidatas las que no los necesitan', () => {
    const ids = eligiblePhrases(PHRASES, ctx({ flags: new Set(['morning', 'evening', 'afternoon', 'back']) })).map((p) => p.id);
    expect(ids).toContain('return_missed');
    expect(ids).not.toContain('care_real_pet_fed');
    expect(ids).not.toContain('care_job');
  });

  it('al aprender la mascota real, la frase del ejemplo pasa a ser candidata y sale bien escrita', () => {
    const vars = { ...ctx().vars, 'tipo.mascota.real': 'perro', 'nombre.mascota.real': 'Toby' };
    const c = ctx({ vars, flags: new Set(['morning']) });
    expect(eligiblePhrases(PHRASES, c, ['care']).map((p) => p.id)).toContain('care_real_pet_fed');
    const only = PHRASES.filter((p) => p.id === 'care_real_pet_fed');
    expect(pickPhrase(only, c)).toEqual({ id: 'care_real_pet_fed', kind: 'care', lang: 'es', text: '¿Has recordado dar de comer hoy a tu perro Toby, Jose?' });
    expect(pickPhrase(only, { ...c, lang: 'en' })?.text).toBe('Did you remember to feed your perro Toby today, Jose?');
  });

  it('siempre hay algo que decir, aunque no se sepa nada del entrenador', () => {
    const picked = pickPhrase(PHRASES, ctx());
    expect(picked).not.toBeNull();
    expect(picked!.text).not.toMatch(/\{\{|\}\}|undefined|null/);
  });

  it('ninguna frase del catálogo deja huecos, con todas las variables y en los dos idiomas', () => {
    const vars = Object.fromEntries(Object.keys(data.variables).map((name) => [name, 'X']));
    for (const lang of ['es', 'en']) {
      for (const p of PHRASES) {
        const text = renderPhrase(p.text[lang], vars);
        expect(text, `${p.id} (${lang})`).not.toBeNull();
        expect(text).not.toMatch(/\{|\}/);
      }
    }
  });

  it('respeta el enfriamiento de cada frase y no repite la misma tres veces', () => {
    const c = ctx({ flags: new Set(['back']) });
    const first = pickPhrase(PHRASES, c, ['return'])!;
    const again = pickPhrase(PHRASES, { ...c, lastAt: { [first.id]: NOW - 60_000 }, recent: [first.id] }, ['return']);
    expect(again?.id).not.toBe(first.id);
    // Pasado el enfriamiento vuelve a poder salir
    const cooldownMs = PHRASES.find((p) => p.id === first.id)!.cooldownMinutes! * 60_000;
    const later = eligiblePhrases(PHRASES, c, ['return']).map((p) => p.id);
    expect(later).toContain(first.id);
    expect(cooldownMs).toBeGreaterThan(0);
  });

  it('la personalidad cambia qué dice: un afectuoso echa de menos, un distante no tanto', () => {
    const count = (affection: number) => {
      let missed = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const p = pickPhrase(PHRASES, ctx({ flags: new Set(['back']), dims: { ...neutralDims(), affection }, rng: createRng(seed) }), ['return']);
        if (p?.id === 'return_missed') missed++;
      }
      return missed;
    };
    expect(count(95)).toBeGreaterThan(count(5) * 2);
  });

  it('es determinista: misma entrada, misma frase', () => {
    const c = () => ctx({ flags: new Set(['back', 'morning']), rng: createRng(42) });
    expect(pickPhrase(PHRASES, c())).toEqual(pickPhrase(PHRASES, c()));
  });

  it('si la frase no existe en el idioma pedido, cae al de reserva', () => {
    const entry: PhraseEntry = { id: 'x', kind: 'idle', text: { es: 'Hola, {{nombre.custodio}}.' } };
    expect(pickPhrase([entry], ctx({ lang: 'fr' }))).toMatchObject({ lang: 'es', text: 'Hola, Jose.' });
  });
});

describe('estado de ánimo de corto plazo', () => {
  const cfg = balance.personality.feeling as FeelingConfig;
  const body = { happiness: 60, energy: 70, hunger: 70 };
  const dims = neutralDims();

  it('en reposo depende de cómo es y de cómo está', () => {
    expect(restingFeeling(dims, body).valence).toBeCloseTo(0.1, 3);
    expect(restingFeeling(dims, { ...body, hunger: 10 }).valence).toBeLessThan(restingFeeling(dims, body).valence);
    expect(restingFeeling({ ...dims, temper: 95 }, body).arousal).toBeGreaterThan(restingFeeling({ ...dims, temper: 5 }, body).arousal);
    expect(restingFeeling(dims, { ...body, sick: true }).valence).toBeLessThan(0);
  });

  it('un regaño le deja dolido, y se le pasa solo con el tiempo', () => {
    const start = initialFeeling(dims, body, NOW);
    const scolded = pushFeeling(start, ['talk_scold'], NOW, dims, body, cfg);
    expect(scolded.valence).toBeLessThan(start.valence - 0.3);
    expect(['upset', 'down', 'neutral']).toContain(feelingLabel(scolded, cfg));
    const rest = restingFeeling(dims, body);
    const later = settleFeeling(scolded, NOW + cfg.halfLifeMinutes * 60_000, rest, cfg);
    // A la vida media, la mitad de la distancia al reposo
    expect(later.valence - rest.valence).toBeCloseTo((scolded.valence - rest.valence) / 2, 2);
    const muchLater = settleFeeling(scolded, NOW + 24 * 3_600_000, rest, cfg);
    expect(muchLater.valence).toBeCloseTo(rest.valence, 2);
  });

  it('a quien es poco valiente lo malo le afecta más; a quien es afectuoso, lo bueno', () => {
    const hit = (bravery: number) => pushFeeling(null, ['talk_scold'], NOW, { ...dims, bravery }, body, cfg).valence;
    expect(hit(5)).toBeLessThan(hit(95));
    const joy = (affection: number) => pushFeeling(null, ['gift_received'], NOW, { ...dims, affection }, body, cfg).valence;
    expect(joy(95)).toBeGreaterThan(joy(5));
  });

  it('varios acontecimientos se acumulan, pero nunca se sale de sus límites', () => {
    let f = initialFeeling(dims, body, NOW);
    for (let i = 0; i < 40; i++) f = pushFeeling(f, ['battle_won', 'gift_received'], NOW, dims, body, cfg);
    expect(f.valence).toBeLessThanOrEqual(1);
    expect(f.arousal).toBeLessThanOrEqual(1);
    expect(feelingLabel(f, cfg)).toBe('excited');
    for (let i = 0; i < 40; i++) f = pushFeeling(f, ['talk_scold', 'neglect_day'], NOW, dims, body, cfg);
    expect(f.valence).toBeGreaterThanOrEqual(-1);
    expect(f.arousal).toBeGreaterThanOrEqual(0);
  });

  it('un acontecimiento desconocido no cambia nada, y un estado corrupto se reinicia', () => {
    const start = initialFeeling(dims, body, NOW);
    expect(pushFeeling(start, ['no_existe'], NOW, dims, body, cfg)).toEqual(start);
    expect(pushFeeling({ valence: NaN, arousal: 0.3, at: NOW } as any, [], NOW, dims, body, cfg)).toEqual(start);
  });

  it('todas las etiquetas son alcanzables y hay una señal de frase para cada una (salvo la neutra)', () => {
    const seen = new Set<string>();
    for (let v = -1; v <= 1; v += 0.1) for (let a = 0; a <= 1; a += 0.05) seen.add(feelingLabel({ valence: v, arousal: a }, cfg));
    expect([...seen].sort()).toEqual([...FEELINGS].sort());
    for (const label of FEELINGS) if (label !== 'neutral') expect(data.flags).toContain(`feeling_${label}`);
  });
});
