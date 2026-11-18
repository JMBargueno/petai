/**
 * Entrada del bundle que cargan los WebView de Android/iOS (y el iframe de depuración).
 *
 * La app nativa envía `start` con `window.pockaiMinigame.receive(<json>)` y recibe `score` y
 * `finished` por su puente (ver bridge.ts). En un navegador sin anfitrión, `?demo=<gameId>` arranca
 * una partida de prueba y escribe los eventos en la consola.
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
  current?.dispose();
  current = null;
  if (msg.type === 'start') {
    current = mountMinigame(root, { ...msg, onEvent: bridge.send });
  }
};

const bridge = createBridge(onMessage);
window.pockaiMinigame = { receive: bridge.receive };
bridge.send({ type: 'ready', protocol: MINIGAME_PROTOCOL_VERSION });

const demo = new URLSearchParams(location.search).get('demo');
if (demo !== null) {
  window.addEventListener('pockai:minigame', (e) => console.info('[minigame]', (e as CustomEvent).detail));
  bridge.receive({ type: 'start', gameId: demo || 'catch_food', seed: 12345, durationSeconds: 30 });
}
