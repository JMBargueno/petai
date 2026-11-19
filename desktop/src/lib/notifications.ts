// Avisos de la mascota. Hay una sola vía de habla: si el pockai está a la vista, lo dice él en su
// bocadillo (cola de `speech-queue`); solo si la ventana está oculta o minimizada se recurre a la
// notificación nativa (Tauri) o, en el navegador, a la Notification API.

import { sfx } from './audio';
import { speak, type SpeechPriority } from './speech-queue';
import { isPetVisible } from './window-visibility';

const COOLDOWN_MS = 30 * 60 * 1000;
const lastSent = new Map<string, number>();
const isTauri = () => '__TAURI_INTERNALS__' in window;

type Notice = { key: string; title: string; body: string; speech: string; priority: SpeechPriority };

export function petNeeds(pet: any): Notice[] {
  if (!pet) return [];
  const name = pet.nickname || pet.species?.name || 'Tu mascota';
  const out: Notice[] = [];
  if (pet.sick) {
    out.push({
      key: 'sick',
      title: `${name} está enfermo`,
      body: 'Necesita medicina para recuperarse.',
      speech: 'No me encuentro bien… necesito medicina para recuperarme. 🤒',
      priority: 'high',
    });
  }
  if (!pet.sleeping) {
    if (pet.hunger < 25)
      out.push({
        key: 'hunger',
        title: `${name} tiene hambre`,
        body: 'Dale de comer antes de que enferme.',
        speech: '¡Tengo mucha hambre! ¿Me das de comer? 🍖',
        priority: 'normal',
      });
    if (pet.energy < 15)
      out.push({
        key: 'energy',
        title: `${name} está agotado`,
        body: 'Es hora de dormir.',
        speech: 'Estoy agotado… creo que es hora de dormir. 😴',
        priority: 'normal',
      });
    if (pet.hygiene < 20)
      out.push({
        key: 'hygiene',
        title: `${name} necesita un baño`,
        body: 'La suciedad afecta a su salud.',
        speech: 'Necesito un baño, la suciedad no me sienta bien. 🛁',
        priority: 'normal',
      });
    if (pet.happiness < 20)
      out.push({
        key: 'happiness',
        title: `${name} está triste`,
        body: 'Juega con él para animarlo.',
        speech: 'Estoy un poco triste… ¿jugamos un rato? 🥺',
        priority: 'normal',
      });
  }
  return out;
}

/** Notificación nativa del sistema. Devuelve `true` si se pudo mostrar. */
export async function sendNative(title: string, body: string): Promise<boolean> {
  if (isTauri()) {
    const n = await import('@tauri-apps/plugin-notification');
    let granted = await n.isPermissionGranted();
    if (!granted) granted = (await n.requestPermission()) === 'granted';
    if (granted) n.sendNotification({ title, body });
    return granted;
  }
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'default') await Notification.requestPermission();
  if (Notification.permission === 'granted') {
    new Notification(title, { body });
    return true;
  }
  return false;
}

export interface AnnounceOptions {
  /** Lo que dice la mascota si está a la vista (por defecto, `body`). `false`: no lo dice (ya lo dice otra vía). */
  speech?: string | false;
  priority?: SpeechPriority;
  key?: string;
}

/**
 * Aviso puntual (p. ej. un recordatorio vencido), sin cooldown. Si la mascota está a la vista lo
 * dice ella; si no, notificación nativa. Devuelve `true` si el aviso llegó por alguna de las dos vías.
 */
export async function notifyNow(title: string, body: string, opts: AnnounceOptions = {}): Promise<boolean> {
  try {
    if (await isPetVisible()) {
      const text = opts.speech ?? body;
      if (text) speak(text, { priority: opts.priority, key: opts.key });
      // Las necesidades llevan su aviso suave; el resto, el de notificación (spec 40).
      sfx(opts.key?.startsWith('needs:') ? 'desk.needs' : 'ui.notification');
      return true;
    }
    return await sendNative(title, body);
  } catch (err) {
    console.warn('[notificaciones] no se pudo enviar:', err);
    return false;
  }
}

/** Envía los avisos de necesidades pendientes respetando un cooldown por tipo y mascota. */
export async function notifyPetNeeds(pet: any) {
  const now = Date.now();
  for (const n of petNeeds(pet)) {
    const key = `${pet.id}:${n.key}`;
    if (now - (lastSent.get(key) ?? 0) < COOLDOWN_MS) continue;
    lastSent.set(key, now);
    await notifyNow(n.title, n.body, { speech: n.speech, priority: n.priority, key: `needs:${key}` });
  }
}
