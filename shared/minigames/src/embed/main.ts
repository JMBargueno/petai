/**
 * Entrada del bundle que cargan los WebView de Android/iOS (y el iframe de depuración).
 *
 * La app nativa envía `start` con `window.pockaiMinigame.receive(<json>)` y recibe `score`,
 * `paused` y `finished` por su puente (ver bridge.ts). En un navegador sin anfitrión,
 * `?demo=<gameId>` arranca una partida de prueba (`&easy` para la variante accesible) y escribe los
 * eventos en la consola.
 */
import { createBridge } from '../bridge';
import { mountMinigame, type MountedMinigame } from '../host';
import { MINIGAME_PROTOCOL_VERSION, type HostMessage } from '../protocol';

declare global {
  interface Window {
    pockaiMinigame?: { receive(raw: unknown): void };
  }
}

const root = document.getElementById('minigame')!;
let current: MountedMinigame | null = null;

const onMessage = (msg: HostMessage) => {
  if (msg.type === 'pause') return current?.pause();
  if (msg.type === 'resume') return current?.resume();
  current?.dispose();
  current = null;
  if (msg.type === 'start') {
    // En el WebView la app nativa avisa de la pausa (ciclo de vida); el foco no es fiable.
    current = mountMinigame(root, { ...msg, autoPause: bridge.transport === 'dom' || bridge.transport === 'iframe', onEvent: bridge.send });
  }
};

const bridge = createBridge(onMessage);
window.pockaiMinigame = { receive: bridge.receive };
bridge.send({ type: 'ready', protocol: MINIGAME_PROTOCOL_VERSION });

const params = new URLSearchParams(location.search);
const demo = params.get('demo');
if (demo !== null) {
  window.addEventListener('pockai:minigame', (e) => console.info('[minigame]', (e as CustomEvent).detail));
  bridge.receive({ type: 'start', gameId: demo || 'catch_food', seed: 12345, durationSeconds: 30, variant: params.has('easy') ? 'easy' : 'standard' });
}
