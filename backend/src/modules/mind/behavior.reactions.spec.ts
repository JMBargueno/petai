import * as fs from 'fs';
import * as path from 'path';
import { BEHAVIORS, Behavior, decideBehavior, isBehavior, promptHint, pushRecentBehavior, reactionScores, validateBehavior, viewOf } from './behavior.engine';
import { Intent } from './conversation.engine';
import { Dims, PersonalityConfig } from './mind.types';
import { neutralDims } from './personality.engine';
import { legacyValidate, legacyWinner } from './__fixtures__/legacy-reactions';

const balance = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../shared/game-data/balance.json'), 'utf8'));
const cfg = balance.personality as PersonalityConfig;

const INTENTS: Intent[] = ['sad_day', 'good_news', 'affection', 'scold', 'play_request', 'explore_request', 'greeting', 'farewell', 'question', 'chat'];
const AWAKE = { sleeping: false, sick: false, energy: 80 };
const LEGACY_BEHAVIORS = ['comfort', 'celebrate', 'cuddle', 'invite_play', 'propose_explore', 'greet', 'wave_goodbye', 'listen', 'ask_back', 'sulk', 'show_off', 'yawn'];

/** Rejilla de personalidades: cinco dimensiones con valores repartidos, incluidos los extremos. */
function grid(): Dims[] {
  const steps = [0, 13, 37, 50, 61, 88, 100];
  const out: Dims[] = [];
  for (const curiosity of steps)
    for (const sociability of [0, 50, 100])
      for (const bravery of steps)
        for (const affection of steps) for (const temper of steps) out.push({ curiosity, sociability, bravery, affection, temper });
  return out;
}

describe('Spec 37 §4.3 — la tabla de reacciones vive en datos', () => {
  it('con la tabla trasladada, decideBehavior devuelve lo mismo que antes', () => {
    const all = grid();
    let total = 0;
    let roundingTies = 0;
    for (const intent of INTENTS) {
      for (const dims of all) {
        total++;
        const old = legacyWinner(intent, dims);
        const expected = legacyValidate(old.behavior, dims, AWAKE, cfg.behavior.minEnergyToPlay);
        const got = decideBehavior(intent, dims, AWAKE, cfg).action;
        if (got === expected) continue;
        // Solo puede diferir donde dos candidatas empataban exactamente y la antigua ganaba por
        // ruido de redondeo (1e-16): ahí no había criterio que conservar
        if (old.lead >= 1e-9) throw new Error(`${intent} ${JSON.stringify(dims)}: antes ${expected}, ahora ${got}`);
        roundingTies++;
      }
    }
    expect(total).toBe(INTENTS.length * all.length);
    // Medido al trasladar la tabla: 98 de 72.030 (0,14 %)
    expect(roundingTies).toBeLessThan(total * 0.005);
  });

  it('las reglas de validación trasladadas coinciden con las de antes', () => {
    const states = [AWAKE, { sleeping: true, sick: false, energy: 80 }, { sleeping: false, sick: true, energy: 80 }, { sleeping: false, sick: false, energy: 5 }];
    const dimsList: Dims[] = [neutralDims(), { ...neutralDims(), affection: 10 }, { ...neutralDims(), bravery: 5 }, { ...neutralDims(), affection: 19, bravery: 14 }];
    // Solo las doce reacciones que existían entonces: las nuevas no tienen reglas antiguas con las que comparar
    for (const b of LEGACY_BEHAVIORS) {
      for (const state of states) {
        for (const dims of dimsList) {
          const expected = legacyValidate(b, dims, state, cfg.behavior.minEnergyToPlay);
          expect({ b, state, got: validateBehavior(b, dims, state, cfg).view.action }).toEqual({ b, state, got: expected });
        }
      }
    }
  });

  it('todas las reacciones del código están en el catálogo de datos, y al revés', () => {
    expect(Object.keys(cfg.behavior.catalog ?? {}).sort()).toEqual([...BEHAVIORS].sort());
  });

  it('una intención sin tabla usa la de la charla corriente', () => {
    expect(reactionScores('intención_futura', neutralDims(), cfg).map((c) => c.behavior)).toEqual(
      reactionScores('chat', neutralDims(), cfg).map((c) => c.behavior),
    );
  });
});

describe('Spec 37 §4.2 — modo superior y audiencia', () => {
  it('dormida solo admite bostezar, ante cualquier audiencia', () => {
    const asleep = { sleeping: true, sick: false, energy: 80 };
    for (const audience of ['owner', 'visitor', 'pockai'] as const) {
      for (const b of BEHAVIORS) expect(validateBehavior(b, neutralDims(), asleep, cfg, audience).view.action).toBe('yawn');
      for (const intent of INTENTS) expect(decideBehavior(intent, neutralDims(), asleep, cfg, { audience }).action).toBe('yawn');
    }
  });

  it('ninguna reacción activa sale sin energía ni enferma', () => {
    const active = Object.entries(cfg.behavior.catalog ?? {})
      .filter(([, c]) => c.active)
      .map(([id]) => id);
    expect(active.length).toBeGreaterThan(0);
    const tired = { sleeping: false, sick: false, energy: cfg.behavior.minEnergyToPlay - 1 };
    const sick = { sleeping: false, sick: true, energy: 80 };
    for (const intent of INTENTS) {
      for (const dims of [neutralDims(), { ...neutralDims(), temper: 100, curiosity: 100, bravery: 100 }]) {
        expect(active).not.toContain(decideBehavior(intent, dims, tired, cfg).action);
        expect(active).not.toContain(decideBehavior(intent, dims, sick, cfg).action);
      }
    }
  });

  it('una reacción pensada para el entrenador nunca se elige ante un visitante ni ante otro Pockai', () => {
    const ownerOnly = Object.entries(cfg.behavior.catalog ?? {})
      .filter(([, c]) => !c.audiences.includes('visitor') && !c.audiences.includes('pockai'))
      .map(([id]) => id);
    expect(ownerOnly).toContain('cuddle');
    for (const audience of ['visitor', 'pockai'] as const) {
      for (const intent of INTENTS) {
        for (const dims of [neutralDims(), { ...neutralDims(), affection: 100, temper: 100 }]) {
          expect(ownerOnly).not.toContain(decideBehavior(intent, dims, AWAKE, cfg, { audience }).action);
        }
      }
      // …ni aunque la proponga el modelo
      for (const b of ownerOnly) expect(validateBehavior(b, neutralDims(), AWAKE, cfg, audience).ok).toBe(false);
    }
  });

  it('una acción fuera de catálogo se sustituye siempre por escuchar', () => {
    expect(validateBehavior('borrar_cuenta', neutralDims(), AWAKE, cfg)).toMatchObject({ ok: false, view: viewOf('listen') });
    expect(isBehavior('listen')).toBe(true);
  });
});

describe('Spec 37 §4.4 — anti-repetición', () => {
  /** Simula `turns` mensajes seguidos de la misma intención, guardando el historial como hace el chat. */
  function run(intent: Intent, dims: Dims, turns: number, seed = 'pet-1') {
    let recent: string[] = [];
    const picks: Behavior[] = [];
    for (let i = 0; i < turns; i++) {
      const action = decideBehavior(intent, dims, AWAKE, cfg, { recent, seed }).action;
      picks.push(action);
      recent = pushRecentBehavior(recent, action, cfg);
    }
    return picks;
  }

  it('veinte turnos neutros seguidos no repiten la misma reacción más de dos veces consecutivas', () => {
    const personalities: Dims[] = [neutralDims(), { ...neutralDims(), curiosity: 95 }, { ...neutralDims(), curiosity: 5, temper: 5 }, { ...neutralDims(), temper: 95 }];
    for (const dims of personalities) {
      for (const intent of ['chat', 'question'] as Intent[]) {
        const picks = run(intent, dims, 20);
        for (let i = 2; i < picks.length; i++) {
          expect({ intent, i, repeated: picks[i] === picks[i - 1] && picks[i] === picks[i - 2] }).toEqual({ intent, i, repeated: false });
        }
      }
    }
  });

  it('antes, la misma personalidad recibía siempre la misma reacción; ahora varía', () => {
    const curious = { ...neutralDims(), curiosity: 90 };
    const without = Array.from({ length: 10 }, () => decideBehavior('chat', curious, AWAKE, cfg).action);
    expect(new Set(without).size).toBe(1);
    expect(new Set(run('chat', curious, 10)).size).toBeGreaterThan(1);
  });

  it('la reacción favorita sigue siendo la que más sale', () => {
    const curious = { ...neutralDims(), curiosity: 95 };
    const picks = run('chat', curious, 40);
    const count = (b: string) => picks.filter((p) => p === b).length;
    expect(count('ask_back')).toBeGreaterThanOrEqual(count('listen'));
    expect(count('ask_back')).toBeGreaterThan(count('invite_play'));
  });

  it('mismo estado, misma reacción: es determinista', () => {
    expect(run('chat', neutralDims(), 20, 'a')).toEqual(run('chat', neutralDims(), 20, 'a'));
    const recent = ['listen', 'ask_back'];
    const once = decideBehavior('question', neutralDims(), AWAKE, cfg, { recent, seed: 'x' }).action;
    for (let i = 0; i < 5; i++) expect(decideBehavior('question', neutralDims(), AWAKE, cfg, { recent, seed: 'x' }).action).toBe(once);
  });

  it('una diferencia mínima no hace saltar de reacción (margen)', () => {
    // Dos candidatas casi iguales: tras elegir la segunda mejor, la primera no la desbanca por décimas
    const tight: PersonalityConfig = {
      ...cfg,
      behavior: {
        ...cfg.behavior,
        antiRepeat: { window: 4, penalty: 1, margin: 0.15 },
        reactions: { chat: [{ behavior: 'listen', base: 1.05 }, { behavior: 'ask_back', base: 1 }] },
      },
    };
    expect(decideBehavior('chat', neutralDims(), AWAKE, tight, { recent: ['ask_back'], seed: 's' }).action).toBe('ask_back');
    // Con una ventaja clara sí cambia
    const clear = { ...tight, behavior: { ...tight.behavior, reactions: { chat: [{ behavior: 'listen', base: 2 }, { behavior: 'ask_back', base: 1 }] } } };
    expect(decideBehavior('chat', neutralDims(), AWAKE, clear, { recent: ['ask_back'], seed: 's' }).action).toBe('listen');
  });

  it('un empate se deshace con la semilla de la mascota, no con el orden de la tabla', () => {
    const tie: PersonalityConfig = {
      ...cfg,
      behavior: {
        ...cfg.behavior,
        antiRepeat: { window: 4, penalty: 0.5, margin: 0 },
        reactions: { chat: [{ behavior: 'listen', base: 1 }, { behavior: 'ask_back', base: 1 }, { behavior: 'show_off', base: 1 }] },
      },
    };
    const picks = new Set<string>();
    for (let i = 0; i < 40; i++) picks.add(decideBehavior('chat', neutralDims(), AWAKE, tie, { recent: ['greet'], seed: `pet-${i}` }).action);
    expect(picks.size).toBeGreaterThan(1);
  });

  it('el historial guardado no crece más que la ventana e ignora ids de otra versión al decidir', () => {
    let recent: string[] = [];
    for (let i = 0; i < 20; i++) recent = pushRecentBehavior(recent, 'listen', cfg);
    expect(recent).toHaveLength(cfg.behavior.antiRepeat!.window);
    expect(isBehavior(decideBehavior('chat', neutralDims(), AWAKE, cfg, { recent: ['reaccion_vieja', 'otra'], seed: 's' }).action)).toBe(true);
  });

  it('con variedad garantizada, la pista de reacción vuelve a enviarse en todos los turnos', () => {
    for (const b of BEHAVIORS) expect(promptHint(viewOf(b))).toContain('Reacción decidida');
  });
});
