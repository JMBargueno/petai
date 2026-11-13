import { io, Socket } from 'socket.io-client';
import { API_BASE_URL, getAccessToken } from './api';

let socket: Socket | null = null;

export function initSocket() {
  if (socket) {
    socket.disconnect();
  }

  const socketUrl = API_BASE_URL || window.location.origin;

  socket = io(`${socketUrl}/realtime`, {
    // Función: se reevalúa en cada (re)conexión para usar el token vigente
    auth: (cb) => cb({ token: getAccessToken() }),
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log('[WebSocket] Conectado al realtime gateway');
  });

  socket.on('disconnect', () => {
    console.log('[WebSocket] Desconectado');
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}
