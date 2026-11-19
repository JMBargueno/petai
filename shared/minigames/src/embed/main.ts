/**
 * Entrada del bundle que cargan los WebView de Android/iOS (y el iframe de depuración).
 *
 * La app nativa envía `start` con `window.pockaiMinigame.receive(<json>)` y recibe `score`,
 * `paused` y `finished` por su puente (ver bridge.ts). En un navegador sin anfitrión,
 * `?demo=<gameId>` arranca una partida de prueba y escribe los eventos en la consola. Admite `&easy`
 * (variante accesible), `&reduced` (movimiento reducido) y `&species=<id>&stage=<etapa>&pattern=<id>`
 * para elegir la mascota.
 */
import { createBridge } from '../bridge';
import { embedSound, setEmbedAudioSettings } from './audio';
import { mountMinigame, type MountedMinigame } from '../host';
import { sheetFromAssetBase } from '../pet';
import { MINIGAME_PROTOCOL_VERSION, parsePet, type HostMessage } from '../protocol';

declare global {
  interface Window {
    pockaiMinigame?: { receive(raw: unknown): void };
  }
}

const root = document.getElementById('minigame')!;
/**
 * Las hojas de las mascotas no van en este bundle (pesan 14 MB y la app ya las lleva): se piden a la
 * carpeta `shared/assets`. En Android está junto al bundle (`/assets/minigames/` → `/assets/`); en
 * desarrollo la sirve el servidor de Vite (vite.config.ts).
 */
const resolvePetSheet = sheetFromAssetBase(import.meta.env.DEV ? '/shared-assets/' : '../');
let current: MountedMinigame | null = null;

const onMessage = (msg: HostMessage) => {
  if (msg.type === 'pause') return current?.pause();
  if (msg.type === 'resume') return current?.resume();
  // Los ajustes de sonido no tocan la partida en curso.
  if (msg.type === 'setAudio') return setEmbedAudioSettings(msg.settings);
  current?.dispose();
  current = null;
  if (msg.type === 'start') {
    // En el WebView la app nativa avisa de la pausa (ciclo de vida); el foco no es fiable.
    current = mountMinigame(root, { ...msg, resolvePetSheet, sound: embedSound(), autoPause: bridge.transport === 'dom' || bridge.transport === 'iframe', onEvent: bridge.send });
  }
};

const bridge = createBridge(onMessage);
window.pockaiMinigame = { receive: bridge.receive };
bridge.send({ type: 'ready', protocol: MINIGAME_PROTOCOL_VERSION });

const params = new URLSearchParams(location.search);
const demo = params.get('demo');
if (demo !== null) {
  window.addEventListener('pockai:minigame', (e) => console.info('[minigame]', (e as CustomEvent).detail));
  bridge.receive({ type: 'start', gameId: demo || 'catch_food', seed: 12345, durationSeconds: 30, variant: params.has('easy') ? 'easy' : 'standard',
    reducedMotion: params.has('reduced'),
    pet: parsePet({ species: params.get('species') ?? 'ignisaur', stage: params.get('stage') ?? 'baby', pattern: params.get('pattern') }),
  });
}
