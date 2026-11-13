import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from './api';

let socket: Socket | null = null;

export function initSocket(userId?: string) {
  if (socket) {
    socket.disconnect();
  }

  socket = io(`${API_BASE_URL}/realtime`, {
    query: userId ? { userId } : {},
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
