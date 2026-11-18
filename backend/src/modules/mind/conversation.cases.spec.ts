import * as fs from 'fs';
import * as path from 'path';
import { interpretMessage } from './conversation.engine';

/**
 * Evaluación de `interpretMessage` (spec 37 §3.2) contra una tabla de frases con su intención
 * esperada, incluidas negaciones, falsos positivos y frases en inglés. La tabla vive en
 * `__fixtures__/intent-cases.json` para poder ampliarla sin tocar este test.
 */
const { cases } = JSON.parse(fs.readFileSync(path.resolve(__dirname, '__fixtures__/intent-cases.json'), 'utf8')) as {
  cases: [string, string][];
};

describe('Conversation Engine — tabla de casos (spec 37 §3.2)', () => {
  it('la tabla cubre todas las intenciones', () => {
    const covered = new Set(cases.map(([, intent]) => intent));
    for (const intent of ['sad_day', 'good_news', 'affection', 'scold', 'play_request', 'explore_request', 'greeting', 'farewell', 'question', 'chat']) {
      expect(covered.has(intent)).toBe(true);
    }
  });

  it.each(cases)('«%s» → %s', (text, expected) => {
    expect(interpretMessage(text).intent).toBe(expected);
  });

  it('una frase negada no deja el recuerdo ni mueve la personalidad como la afirmada', () => {
    const negated = interpretMessage('no estoy triste');
    expect(negated.episode).toBeNull();
    expect(negated.evolutionEvent).toBeUndefined();
    expect(negated.sentiment).toBe(0);
  });
});
