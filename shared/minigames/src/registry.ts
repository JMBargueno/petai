import type { GameDefinition, GameInput } from './core/types';
import { catchFood } from './games/catchFood';
import { memoryMatch } from './games/memoryMatch';
import { reflex } from './games/reflex';
import type { GameView } from './views/types';
import { createCatchFoodView } from './views/catchFoodView';
import { createMemoryMatchView } from './views/memoryMatchView';
import { createReflexView } from './views/reflexView';

/**
 * Catálogo de minijuegos que saben jugar los clientes. Las reglas de recompensa y el techo están en
 * `shared/game-data/balance.json` (`minigames.games`); un test exige que ambos tengan los mismos ids.
 */
export interface MinigameEntry {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  definition: GameDefinition<any, GameInput>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createView: () => GameView<any>;
  /** Nombre de icono de la app (Lucide en escritorio). */
  icon: string;
  /** Instrucciones de una línea, para la cuenta atrás. */
  howTo: string;
}

const entries: MinigameEntry[] = [
  {
    id: 'catch_food',
    definition: catchFood as MinigameEntry['definition'],
    createView: createCatchFoodView,
    icon: 'apple',
    howTo: 'Mueve la cesta con el ratón, el dedo o las flechas ← → y atrapa la comida.',
  },
  {
    id: 'memory_match',
    definition: memoryMatch as MinigameEntry['definition'],
    createView: createMemoryMatchView,
    icon: 'cards',
    howTo: 'Destapa dos cartas iguales. Puedes usar Tab y Enter.',
  },
  {
    id: 'reflex',
    definition: reflex as MinigameEntry['definition'],
    createView: createReflexView,
    icon: 'target',
    howTo: 'Pulsa el objetivo en cuanto aparezca, con el ratón, tocándolo o con Espacio.',
  },
];

export const MINIGAMES: Readonly<Record<string, MinigameEntry>> = Object.freeze(
  Object.fromEntries(entries.map((e) => [e.id, e])),
);

export const getMinigame = (id: string): MinigameEntry | undefined => MINIGAMES[id];
export const isSupportedMinigame = (id: string) => id in MINIGAMES;
