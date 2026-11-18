/**
 * Puente entre la escena incrustada y la app nativa.
 *
 * - Android: la app registra `addJavascriptInterface(obj, "AndroidBridge")` con `postMessage(String)`,
 *   y envía mensajes con `evaluateJavascript("window.pockaiScene.receive(<json>)")`.
 * - iOS: `WKUserContentController.add(handler, name: "pockai")`; envía con `evaluateJavaScript`.
 * - Navegador/escritorio: `window.parent.postMessage` (iframe) o, sin anfitrión, eventos DOM
 *   `pockai:event` en `window` (útil para depurar la página embed).
 */
import { parseHostMessage, type HostMessage, type SceneEvent } from './protocol';

interface AndroidBridge {
  postMessage(json: string): void;
}
interface WebkitHandlers {
  messageHandlers?: { pockai?: { postMessage(msg: unknown): void } };
}

export type Transport = 'android' | 'ios' | 'iframe' | 'dom';

export function detectTransport(w: Window & Record<string, unknown> = window as never): Transport {
  if (w.AndroidBridge && typeof (w.AndroidBridge as AndroidBridge).postMessage === 'function') return 'android';
  if ((w.webkit as WebkitHandlers | undefined)?.messageHandlers?.pockai) return 'ios';
  if (w.parent && w.parent !== w) return 'iframe';
  return 'dom';
}

export function createBridge(onMessage: (msg: HostMessage) => void, w: Window & Record<string, unknown> = window as never) {
  const transport = detectTransport(w);

  const send = (event: SceneEvent) => {
    switch (transport) {
      case 'android':
        (w.AndroidBridge as AndroidBridge).postMessage(JSON.stringify(event));
        break;
      case 'ios':
        (w.webkit as WebkitHandlers).messageHandlers!.pockai!.postMessage(event);
        break;
      case 'iframe':
        w.parent.postMessage({ pockai: event }, '*');
        break;
      default:
        w.dispatchEvent(new CustomEvent('pockai:event', { detail: event }));
    }
  };

  const receive = (raw: unknown) => {
    const msg = parseHostMessage(raw);
    if (msg) onMessage(msg);
    else send({ type: 'error', message: `Mensaje no válido: ${typeof raw === 'string' ? raw.slice(0, 120) : typeof raw}` });
  };

  // iframe: solo aceptamos mensajes del padre directo.
  const onWindowMessage = (e: MessageEvent) => {
    if (transport === 'iframe' && e.source === w.parent && e.data && typeof e.data === 'object' && 'pockai' in e.data) {
      receive((e.data as { pockai: unknown }).pockai);
    }
  };
  w.addEventListener('message', onWindowMessage);

  return {
    transport,
    send,
    receive,
    dispose: () => w.removeEventListener('message', onWindowMessage),
  };
}
