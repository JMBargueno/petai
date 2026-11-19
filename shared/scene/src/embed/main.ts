/**
 * Punto de entrada del bundle que cargan los WebView de Android/iOS (y el iframe de depuración).
 *
 * La app nativa envía mensajes con `window.pockaiScene.receive(<json>)` y recibe eventos por su
 * puente (ver bridge.ts). Si se abre en un navegador sin anfitrión, `?demo` monta un Pockai de
 * ejemplo y un panel para probar el protocolo.
 */
import { createBridge } from '../bridge';
import { PockaiScene } from '../PockaiScene';
import type { HostMessage, SceneEvent } from '../protocol';
import { getEmbedAudio } from './audio';
import { EmbedPetSounds } from './petSounds';

declare global {
  interface Window {
    pockaiScene?: { receive(raw: unknown): void; ready: Promise<void> };
  }
}

const root = document.getElementById('scene')!;
const pending: HostMessage[] = [];
let scene: PockaiScene | null = null;

const audio = getEmbedAudio();
const petSounds = new EmbedPetSounds(audio);

const bridge = createBridge((msg) => {
  if (msg.type === 'setAudio') return audio.setSettings(msg.settings);
  petSounds.onHost(msg);
  if (scene) scene.receive(msg);
  else pending.push(msg);
});

const onEvent = (event: SceneEvent) => {
  petSounds.onScene(event);
  bridge.send(event);
};

const ready = PockaiScene.create({ host: root, onEvent }).then((s) => {
  scene = s;
  pending.splice(0).forEach((m) => s.receive(m));
});
window.pockaiScene = { receive: bridge.receive, ready: ready.then(() => undefined) };

const demo = new URLSearchParams(location.search).get('demo');
if (demo !== null) {
  if (demo === 'story') void import('./demoStory').then((m) => m.mountStoryDemo(window.pockaiScene!.receive));
  else void import('./demo').then((m) => m.mountDemo(window.pockaiScene!.receive, demo === 'room'));
}
