/**
 * Punto de entrada del bundle que cargan los WebView de Android/iOS (y el iframe de depuración).
 *
 * La app nativa envía mensajes con `window.pockaiScene.receive(<json>)` y recibe eventos por su
 * puente (ver bridge.ts). Si se abre en un navegador sin anfitrión, `?demo` monta un Pockai de
 * ejemplo y un panel para probar el protocolo.
 */
import { createBridge } from '../bridge';
import { PockaiScene } from '../PockaiScene';
import type { HostMessage } from '../protocol';

declare global {
  interface Window {
    pockaiScene?: { receive(raw: unknown): void; ready: Promise<void> };
  }
}

const root = document.getElementById('scene')!;
const pending: HostMessage[] = [];
let scene: PockaiScene | null = null;

const bridge = createBridge((msg) => (scene ? scene.receive(msg) : pending.push(msg)));

const ready = PockaiScene.create({ host: root, onEvent: bridge.send }).then((s) => {
  scene = s;
  pending.splice(0).forEach((m) => s.receive(m));
});
window.pockaiScene = { receive: bridge.receive, ready: ready.then(() => undefined) };

const demo = new URLSearchParams(location.search).get('demo');
if (demo !== null) {
  void import('./demo').then((m) => m.mountDemo(window.pockaiScene!.receive, demo === 'room'));
}
