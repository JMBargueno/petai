/**
 * Copia literal de cómo se elegía la reacción del chat antes de la spec 37 §4.3, cuando los pesos
 * estaban escritos en `behavior.engine.ts`. Solo la usa el test de regresión: sirve de referencia
 * para comprobar que la tabla trasladada a `balance.json` decide lo mismo. No la importa nadie más.
 */
import type { Intent } from '../conversation.engine';
import type { Dims } from '../mind.types';

export function legacyCandidates(intent: Intent, d: Dims): [string, number][] {
  const n = (v: number) => v / 100;
  switch (intent) {
    case 'sad_day':
      return [
        ['comfort', 0.5 + n(d.affection)],
        ['cuddle', n(d.affection) + (1 - n(d.temper)) * 0.5],
        ['invite_play', n(d.temper) * 0.6 + n(d.sociability) * 0.6],
        ['listen', (1 - n(d.affection)) * 0.9],
      ];
    case 'good_news':
      return [
        ['celebrate', 0.6 + n(d.temper)],
        ['cuddle', n(d.affection)],
        ['ask_back', n(d.curiosity) * 0.9],
      ];
    case 'affection':
      return [
        ['cuddle', 0.4 + n(d.affection)],
        ['show_off', (1 - n(d.affection)) * 0.6 + n(d.bravery) * 0.3],
        ['listen', (1 - n(d.affection)) * 0.7],
      ];
    case 'scold':
      return [
        ['sulk', 0.5 + (1 - n(d.bravery)) * 0.5],
        ['listen', n(d.affection) * 0.8],
        ['show_off', n(d.bravery) * n(d.temper)],
      ];
    case 'play_request':
      return [
        ['invite_play', 0.6 + n(d.temper)],
        ['listen', (1 - n(d.temper)) * 0.6],
      ];
    case 'explore_request':
      return [
        ['propose_explore', 0.4 + n(d.curiosity) + n(d.bravery) * 0.4],
        ['listen', (1 - n(d.bravery)) * 0.8],
      ];
    case 'greeting':
      return [
        ['greet', 0.8 + n(d.sociability) * 0.4],
        ['cuddle', n(d.affection) * 0.9],
      ];
    case 'farewell':
      return [
        ['wave_goodbye', 1],
        ['sulk', n(d.affection) * 0.5 * (1 - n(d.bravery))],
      ];
    case 'question':
      return [
        ['ask_back', 0.4 + n(d.curiosity)],
        ['show_off', n(d.bravery) * 0.6],
        ['listen', 0.6],
      ];
    default:
      return [
        ['listen', 0.6],
        ['ask_back', n(d.curiosity) * 0.9],
        ['invite_play', n(d.temper) * 0.5],
      ];
  }
}

/** Ganadora antigua (la primera de mayor peso) y cuánto le sacaba a la segunda. */
export function legacyWinner(intent: Intent, d: Dims): { behavior: string; lead: number } {
  const list = legacyCandidates(intent, d);
  let best = list[0];
  for (const c of list) if (c[1] > best[1]) best = c;
  const others = list.filter((c) => c !== best).map((c) => c[1]);
  return { behavior: best[0], lead: best[1] - Math.max(...others, -Infinity) };
}

/** Reglas de validación antiguas (umbrales que estaban escritos en el código). */
export function legacyValidate(
  proposed: string,
  dims: Dims,
  state: { sleeping: boolean; sick: boolean; energy: number },
  minEnergyToPlay: number,
): string {
  if (state.sleeping) return 'yawn';
  const active = proposed === 'invite_play' || proposed === 'propose_explore' || proposed === 'celebrate';
  if (active && (state.sick || state.energy < minEnergyToPlay)) return state.energy < minEnergyToPlay ? 'yawn' : 'cuddle';
  if (proposed === 'cuddle' && dims.affection < 20) return 'listen';
  if (proposed === 'propose_explore' && dims.bravery < 15) return 'listen';
  return proposed;
}
