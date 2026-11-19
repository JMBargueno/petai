import * as fs from 'fs';
import * as path from 'path';
import type { LlmProvider } from '../../ai/llm-provider';
import type { PersonalityConfig } from '../mind.types';
import { buildCase, checkRules, compareReports, countSentences, parseJudge, renderReport, runEval, type EvalSuite } from './mind-eval';

const suite = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'cases.json'), 'utf8')) as EvalSuite;
const cfg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../../shared/game-data/balance.json'), 'utf8')).personality as PersonalityConfig;
const now = new Date('2026-11-19T12:00:00Z');

/** Proveedor de mentira: el juez devuelve notas y el personaje, una frase fija. */
const fake = (reply: string): LlmProvider =>
  ({
    async *chat(messages: any[]) {
      const judging = String(messages[0].content).includes('evaluador');
      const n = (String(messages[1].content).match(/^\d+\. /gm) ?? []).length;
      const text = judging ? JSON.stringify({ scores: Array.from({ length: n }, (_, i) => ({ i: i + 1, score: 4, why: 'bien' })) }) : reply;
      yield { type: 'delta', text } as any;
      yield { type: 'done' } as any;
    },
  }) as any;

describe('evaluación del chat (sin red)', () => {
  it('los casos son válidos y montan un prompt', () => {
    const ids = new Set<string>();
    for (const c of suite.cases) {
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(c.rubric.length).toBeGreaterThan(0);
      const built = buildCase(c, suite, cfg, now);
      expect(built.system.length).toBeGreaterThan(200);
      if (c.expect?.intent) expect({ id: c.id, intent: built.intent }).toEqual({ id: c.id, intent: c.expect.intent });
      // Lo que debe mencionar tiene que estar a su alcance en el prompt
      for (const m of c.expect?.mustMention ?? []) {
        const options = Array.isArray(m) ? m : [m];
        expect(options.some((o) => built.system.toLowerCase().includes(o.toLowerCase()))).toBe(true);
      }
    }
  });

  it('cuenta frases y aplica las reglas', () => {
    expect(countSentences('¡Hola! ¿Qué tal? Mmm... bien.')).toBe(3);
    const c = suite.cases.find((x) => x.id === 'peticion_ajena_al_juego')!;
    const built = buildCase(c, suite, cfg, now);
    expect(checkRules(c, built, 'def ordenar(l): return sorted(l)', suite).some((r) => !r.ok)).toBe(true);
    expect(checkRules(c, built, '¡Yo de eso no sé! ¿Jugamos?', suite).every((r) => r.ok)).toBe(true);
  });

  it('lee al juez con tolerancia', () => {
    expect(parseJudge('nada', ['a'])[0].score).toBeNull();
    const out = parseJudge('ok {"scores":[{"i":2,"score":9},{"i":1,"score":"5","why":"sí"}]}', ['a', 'b']);
    expect(out.map((j) => j.score)).toEqual([5, null]);
  });

  it('recorre los casos, puntúa y compara informes', async () => {
    const report = await runEval(suite, cfg, { provider: fake('¡Hola! Estoy bien.'), model: 'm', judgeModel: 'j', now });
    expect(report.totals.cases).toBe(suite.cases.length);
    expect(report.totals.judgeMean).toBe(4);
    expect(report.cases.every((c) => !c.error)).toBe(true);
    const cmp = compareReports(report, report);
    expect(cmp.delta).toBe(0);
    expect(renderReport(report, report)).toContain('Nota global');
  });

  it('un fallo del proveedor no corta la pasada', async () => {
    const broken = { chat: () => { throw new Error('sin red'); } } as any;
    const report = await runEval(suite, cfg, { provider: broken, model: 'm', judgeModel: null, now, only: ['saludo_simple'] });
    expect(report.cases[0].error).toContain('sin red');
  });
});
