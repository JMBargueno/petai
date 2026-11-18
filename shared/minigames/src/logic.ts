/**
 * Solo la lógica de los minijuegos, sin DOM: es lo que importa el backend para repetir y validar
 * partidas (spec 39, fase 3). Se compila a CommonJS en `dist/node` (`build:node`).
 */
import type { AnyGameDefinition } from './core/runner';
import { catchFood } from './games/catchFood';
import { memoryMatch } from './games/memoryMatch';
import { reflex } from './games/reflex';
import { pulsoVoltaico } from './games/pulsoVoltaico';
import { corrienteDatos } from './games/corrienteDatos';
import { raizFractal } from './games/raizFractal';
import { cifrado } from './games/cifrado';
import { faroClaridad } from './games/faroClaridad';
import { forjaTermica } from './games/forjaTermica';

export { createRng, shuffle } from './core/rng';
export { createRunner, replay, type Runner, type AnyGameDefinition } from './core/runner';
export { packLog, unpackLog, maxLogEntries, type PackedEntry } from './core/log';
export * from './core/types';

export const GAME_DEFINITIONS: Readonly<Record<string, AnyGameDefinition>> = Object.freeze(
  Object.fromEntries(
    [catchFood, memoryMatch, reflex, pulsoVoltaico, corrienteDatos, raizFractal, cifrado, faroClaridad, forjaTermica].map((d) => [d.id, d as AnyGameDefinition]),
  ),
);

export const getGameDefinition = (id: string): AnyGameDefinition | undefined => GAME_DEFINITIONS[id];
