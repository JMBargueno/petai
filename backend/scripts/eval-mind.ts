/**
 * Evaluación manual del chat del Pockai con un modelo real (spec 41, fase C). No corre en la CI.
 *
 *   EVAL_API_KEY=... EVAL_BASE_URL=https://.../v1 EVAL_MODEL=... pnpm run eval:mind
 *
 * Opcionales: EVAL_JUDGE_MODEL (por defecto el mismo modelo; `none` para comprobar solo reglas),
 * EVAL_JUDGE_BASE_URL y EVAL_JUDGE_API_KEY (por defecto los del modelo), EVAL_ONLY (ids separados
 * por comas) y EVAL_OUT (carpeta de informes, por defecto `eval-reports`, fuera de git).
 * Si en la carpeta hay un informe anterior (`latest.json`), el nuevo se compara con él.
 */
import * as fs from 'fs';
import * as path from 'path';
import { OpenAiCompatibleProvider } from '../src/modules/ai/openai-compatible.provider';
import { renderReport, runEval, type EvalReport, type EvalSuite } from '../src/modules/mind/eval/mind-eval';

async function main() {
  const env = process.env;
  if (!env.EVAL_API_KEY || !env.EVAL_BASE_URL || !env.EVAL_MODEL) {
    console.error('Faltan EVAL_API_KEY, EVAL_BASE_URL o EVAL_MODEL.');
    process.exit(2);
  }
  const root = path.resolve(__dirname, '..');
  const suite = JSON.parse(fs.readFileSync(path.join(root, 'src/modules/mind/eval/cases.json'), 'utf8')) as EvalSuite;
  const cfg = JSON.parse(fs.readFileSync(path.join(root, '../shared/game-data/balance.json'), 'utf8')).personality;
  const provider = new OpenAiCompatibleProvider(env.EVAL_BASE_URL, env.EVAL_API_KEY);
  const judgeModel = env.EVAL_JUDGE_MODEL === 'none' ? null : env.EVAL_JUDGE_MODEL || env.EVAL_MODEL;
  const judgeProvider = env.EVAL_JUDGE_BASE_URL || env.EVAL_JUDGE_API_KEY ? new OpenAiCompatibleProvider(env.EVAL_JUDGE_BASE_URL || env.EVAL_BASE_URL, env.EVAL_JUDGE_API_KEY || env.EVAL_API_KEY) : provider;

  const out = path.resolve(root, env.EVAL_OUT || 'eval-reports');
  fs.mkdirSync(out, { recursive: true });
  const latest = path.join(out, 'latest.json');
  const previous: EvalReport | null = fs.existsSync(latest) ? JSON.parse(fs.readFileSync(latest, 'utf8')) : null;

  const report = await runEval(suite, cfg, {
    provider,
    model: env.EVAL_MODEL,
    judgeProvider,
    judgeModel,
    now: new Date(),
    only: env.EVAL_ONLY ? env.EVAL_ONLY.split(',').map((s) => s.trim()) : undefined,
    onCase: (c) => console.log(`${c.error ? 'ERROR' : `${Math.round(c.score * 100)} %`.padStart(5)}  ${c.id}`),
  });
  const stamp = report.at.replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(out, `${stamp}.json`), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(out, `${stamp}.md`), renderReport(report, previous));
  // Solo una pasada completa sirve de referencia para la siguiente
  if (!env.EVAL_ONLY) fs.writeFileSync(latest, JSON.stringify(report, null, 2));
  console.log(`\nNota global: ${Math.round(report.totals.score * 100)} % · informe en ${path.join(out, `${stamp}.md`)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
