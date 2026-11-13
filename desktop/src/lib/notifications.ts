// Notificaciones nativas (Tauri) cuando la mascota necesita atención.
// En el navegador usa la Notification API como alternativa.

const COOLDOWN_MS = 30 * 60 * 1000;
const lastSent = new Map<string, number>();
const isTauri = () => '__TAURI_INTERNALS__' in window;

type Notice = { key: string; title: string; body: string };

export function petNeeds(pet: any): Notice[] {
  if (!pet) return [];
  const name = pet.nickname || pet.species?.name || 'Tu mascota';
  const out: Notice[] = [];
  if (pet.sick) {
    out.push({ key: 'sick', title: `${name} está enfermo`, body: 'Necesita medicina para recuperarse.' });
  }
  if (!pet.sleeping) {
    if (pet.hunger < 25) out.push({ key: 'hunger', title: `${name} tiene hambre`, body: 'Dale de comer antes de que enferme.' });
    if (pet.energy < 15) out.push({ key: 'energy', title: `${name} está agotado`, body: 'Es hora de dormir.' });
    if (pet.hygiene < 20) out.push({ key: 'hygiene', title: `${name} necesita un baño`, body: 'La suciedad afecta a su salud.' });
    if (pet.happiness < 20) out.push({ key: 'happiness', title: `${name} está triste`, body: 'Juega con él para animarlo.' });
  }
  return out;
}

async function send(title: string, body: string) {
  if (isTauri()) {
    const n = await import('@tauri-apps/plugin-notification');
    let granted = await n.isPermissionGranted();
    if (!granted) granted = (await n.requestPermission()) === 'granted';
    if (granted) n.sendNotification({ title, body });
    return;
  }
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'default') await Notification.requestPermission();
  if (Notification.permission === 'granted') new Notification(title, { body });
}

/** Envía las notificaciones pendientes respetando un cooldown por tipo y mascota. */
export async function notifyPetNeeds(pet: any) {
  const now = Date.now();
  for (const n of petNeeds(pet)) {
    const key = `${pet.id}:${n.key}`;
    if (now - (lastSent.get(key) ?? 0) < COOLDOWN_MS) continue;
    lastSent.set(key, now);
    try {
      await send(n.title, n.body);
    } catch (err) {
      console.warn('[notificaciones] no se pudo enviar:', err);
    }
  }
}
