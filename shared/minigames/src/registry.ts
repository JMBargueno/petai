import type { AnyGameDefinition } from './core/runner';
import { GAME_DEFINITIONS } from './logic';
import type { GameView } from './views/types';
import { createCatchFoodView } from './views/catchFoodView';
import { createMemoryMatchView } from './views/memoryMatchView';
import { createReflexView } from './views/reflexView';
import { createPulsoVoltaicoView } from './views/pulsoVoltaicoView';
import { createCorrienteDatosView } from './views/corrienteDatosView';
import { createRaizFractalView } from './views/raizFractalView';
import { createCifradoView } from './views/cifradoView';
import { createFaroClaridadView } from './views/faroClaridadView';
import { createForjaTermicaView } from './views/forjaTermicaView';

/**
 * Catálogo de minijuegos que saben jugar los clientes. Las reglas de recompensa, el techo y el
 * elemento están en `shared/game-data/balance.json` (`minigames.games`); un test exige que ambos
 * tengan los mismos ids.
 */
export interface MinigameEntry {
  id: string;
  definition: AnyGameDefinition;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createView: () => GameView<any>;
  /** Nombre de icono de la app (Lucide en escritorio). */
  icon: string;
  /** Instrucciones de una línea, para la cuenta atrás. */
  howTo: string;
}

const UI: Record<string, Omit<MinigameEntry, 'id' | 'definition'>> = {
  catch_food: { createView: createCatchFoodView, icon: 'apple', howTo: 'Lleva a tu Pockai bajo los frutos con el ratón, el dedo o las flechas ← →. Los de la marea valen doble.' },
  memory_match: { createView: createMemoryMatchView, icon: 'cards', howTo: 'Mira el destello del Cristal y empareja las facetas iguales. Puedes usar Tab y Enter.' },
  reflex: { createView: createReflexView, icon: 'target', howTo: 'Pesca el Códice en cuanto aflore (clic, toque o Espacio) y deja pasar los que están rotos.' },
  pulso_voltaico: { createView: createPulsoVoltaicoView, icon: 'energy', howTo: 'Pulsa el carril (J K L) cuando el pulso cruce la línea de sinapsis.' },
  corriente_datos: { createView: createCorrienteDatosView, icon: 'water', howTo: 'Cambia de carril (← →) para recoger paquetes y esquivar bloques corruptos.' },
  raiz_fractal: { createView: createRaizFractalView, icon: 'leaf', howTo: 'Gira las raíces para llevar la savia de la semilla al borde derecho.' },
  cifrado: { createView: createCifradoView, icon: 'moon', howTo: 'Memoriza el orden de los glifos y repítelo.' },
  faro_claridad: { createView: createFaroClaridadView, icon: 'sun', howTo: 'Deja el haz de luz sobre los bits corruptos para purificarlos.' },
  forja_termica: { createView: createForjaTermicaView, icon: 'flame', howTo: 'Aviva el fuelle para mantener la forja en la franja dorada.' },
};

export const MINIGAMES: Readonly<Record<string, MinigameEntry>> = Object.freeze(
  Object.fromEntries(
    Object.entries(UI)
      .filter(([id]) => GAME_DEFINITIONS[id])
      .map(([id, ui]) => [id, { id, definition: GAME_DEFINITIONS[id], ...ui }]),
  ),
);

export const getMinigame = (id: string): MinigameEntry | undefined => MINIGAMES[id];
export const isSupportedMinigame = (id: string) => id in MINIGAMES;
