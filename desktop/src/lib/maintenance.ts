import { writable, get } from 'svelte/store';

/** Cabecera con la que el backend distingue la app de escritorio de la web (mantenimiento por alcance). */
export const CLIENT_HEADERS = { 'X-Client': 'desktop' } as const;

/** Código del 503 que devuelve la API mientras dura el mantenimiento manual. */
export const MAINTENANCE_CODE = 'MAINTENANCE';

/** Cada cuánto se mira si el mantenimiento ha terminado mientras la app está bloqueada. */
export const MAINTENANCE_POLL_MS = 60_000;

export const DEFAULT_MAINTENANCE_MESSAGE = 'Pockai está en mantenimiento. Volvemos enseguida.';

/**
 * Mensaje del mantenimiento en curso, o null si la app funciona con normalidad. Mientras no es null
 * la app se bloquea (como con la actualización obligatoria) y comprueba cada minuto si ya terminó.
 */
export const maintenanceLock = writable<string | null>(null);

let baseUrl = '';
let timer: ReturnType<typeof setTimeout> | null = null;

/** La API ha respondido 503 `MAINTENANCE` (o el canal en tiempo real se ha cerrado por lo mismo). */
export function enterMaintenance(body: unknown) {
  const b = (body ?? {}) as { message?: unknown; messages?: { es?: unknown } };
  const text = typeof b.messages?.es === 'string' ? b.messages.es : typeof b.message === 'string' ? b.message : '';
  maintenanceLock.set(text.trim() || DEFAULT_MAINTENANCE_MESSAGE);
  schedule();
}

/** Lee una copia del cuerpo: si es un 503 de mantenimiento, bloquea la app. Devuelve si lo era. */
export async function inspectMaintenance(res: Response): Promise<boolean> {
  if (res.status !== 503) return false;
  const body = await res.clone().json().catch(() => null);
  if (body?.code !== MAINTENANCE_CODE) return false;
  enterMaintenance(body);
  return true;
}

/** ¿Sigue el mantenimiento para las apps? Lo dice la configuración pública (siempre abierta). */
export async function checkMaintenance(fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetcher(`${baseUrl}/v1/site/config`, { headers: { Accept: 'application/json', ...CLIENT_HEADERS } });
    if (!res.ok) return get(maintenanceLock) !== null;
    const m = (await res.json())?.maintenance;
    const active = !!m?.enabled && m.scope !== 'web';
    if (!active) maintenanceLock.set(null);
    else {
      const es = typeof m.message?.es === 'string' && m.message.es.trim() ? m.message.es : null;
      maintenanceLock.set(es ?? get(maintenanceLock) ?? DEFAULT_MAINTENANCE_MESSAGE);
    }
    return active;
  } catch {
    // Sin conexión: se queda como estaba y se vuelve a intentar.
    return get(maintenanceLock) !== null;
  }
}

/** Configura la URL del backend (la pone api.ts al cargar). */
export function setMaintenanceBaseUrl(url: string) {
  baseUrl = url;
}

function schedule() {
  if (timer) return;
  timer = setTimeout(async () => {
    timer = null;
    if (await checkMaintenance()) schedule();
  }, MAINTENANCE_POLL_MS);
}

/** Solo para tests. */
export function resetMaintenance() {
  if (timer) clearTimeout(timer);
  timer = null;
  maintenanceLock.set(null);
}
