import { io, Socket } from 'socket.io-client';
import { API_BASE_URL, getAccessToken, onTokenRenewed, renewAccessToken } from './api';
import { hasCore } from '@pockai/client';
import { CoreSocket } from './coreSocket';
import { enterMaintenance } from './maintenance';

let socket: Socket | null = null;
/** Token enviado en el último handshake. */
let handshakeToken: string | null = null;
/** El servidor avisó con `auth:expired` antes de cortar. */
let expiredNotice = false;
let lastRecoveryAt = 0;
let stopTokenListener: (() => void) | null = null;

/** Mínimo entre dos renovaciones provocadas por el socket: evita bucles si el servidor rechaza un token recién emitido. */
const MIN_RECOVERY_INTERVAL_MS = 5_000;

function isExpired(token: string | null): boolean {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now();
  } catch {
    return false;
  }
}

/**
 * El servidor cierra la conexión cuando caduca el access token con el que se abrió, y socket.io
 * no reconecta solo tras un cierre iniciado por el servidor: se renueva el token y se reconecta.
 * Un único intento; si no se puede renovar no se insiste (si más tarde una petición HTTP renueva
 * el token, `onTokenRenewed` vuelve a conectar).
 */
async function recover(s: Socket) {
  const now = Date.now();
  if (now - lastRecoveryAt < MIN_RECOVERY_INTERVAL_MS) return;
  lastRecoveryAt = now;
  const token = await renewAccessToken(handshakeToken);
  if (token && s === socket && !s.active) s.connect();
}

/** Clave de localStorage donde persistimos el id estable del dispositivo. */
const DEVICE_ID_KEY = 'petai.deviceId';

/** Genera un id único: usa `crypto.randomUUID()` si está disponible, con fallback simple. */
function randomDeviceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback sin crypto.randomUUID: marca de tiempo + aleatorio base36.
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Devuelve el id estable del dispositivo. Lee el valor persistido en
 * `localStorage` bajo `petai.deviceId`; si no existe, genera uno y lo guarda.
 * Se protege contra entornos sin `window` (SSR/pruebas): en ese caso solo
 * devuelve un id generado, sin persistir.
 */
export function getDeviceId(): string {
  const storage = typeof window !== 'undefined' ? window.localStorage : null;
  if (storage) {
    try {
      const existing = storage.getItem(DEVICE_ID_KEY);
      if (existing) return existing;
      const id = randomDeviceId();
      storage.setItem(DEVICE_ID_KEY, id);
      return id;
    } catch {
      // localStorage no disponible (modo privado, quota, etc.): devolvemos uno volátil.
      return randomDeviceId();
    }
  }
  return randomDeviceId();
}

export function initSocket() {
  closeSocket();

  // Dentro de la app el canal lo lleva el núcleo (Rust): conexión, token y reconexión son suyos.
  if (hasCore()) {
    const core = new CoreSocket();
    void core.open().catch((e) => console.error('[tiempo real] no se pudo abrir el canal', e));
    socket = core as unknown as Socket;
    return socket;
  }

  const socketUrl = API_BASE_URL || window.location.origin;

  const s = io(`${socketUrl}/realtime`, {
    // Función: se reevalúa en cada (re)conexión para usar el token vigente
    auth: (cb) => {
      handshakeToken = getAccessToken();
      // El backend usa `deviceId` + `platform` como señal de presencia del dispositivo.
      // `client`: el backend distingue web y apps para el modo mantenimiento.
      cb({ token: handshakeToken, deviceId: getDeviceId(), platform: 'desktop', client: 'desktop' });
    },
    transports: ['websocket', 'polling'],
  });
  socket = s;
  expiredNotice = false;
  lastRecoveryAt = 0;

  s.on('connect', () => {
    expiredNotice = false;
    console.log('[WebSocket] Conectado al realtime gateway');
  });

  s.on('auth:expired', () => {
    expiredNotice = true;
  });

  // Mantenimiento manual: el servidor cierra el canal; la app se bloquea con el aviso.
  s.on('maintenance', (body: unknown) => enterMaintenance(body));

  s.on('disconnect', (reason) => {
    console.log('[WebSocket] Desconectado:', reason);
    if (reason !== 'io server disconnect' || s !== socket) return;
    // Solo se renueva si el corte es por caducidad; otros cierres del servidor (tope de
    // conexiones, cierre de todas las sesiones) no se reintentan.
    if (expiredNotice || isExpired(handshakeToken)) {
      expiredNotice = false;
      void recover(s);
    }
  });

  // Token renovado por una petición HTTP mientras el socket estaba caído: reconectar con él
  stopTokenListener = onTokenRenewed((token) => {
    if (s === socket && !s.active && token !== handshakeToken) s.connect();
  });

  return s;
}

export function closeSocket() {
  stopTokenListener?.();
  stopTokenListener = null;
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket(): Socket | null {
  return socket;
}
