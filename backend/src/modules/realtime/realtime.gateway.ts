import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { socketCorsOrigin } from '../../common/cors';

/** Conexiones simultáneas por usuario; al superarlas se cierran las más antiguas. */
const MAX_SOCKETS_PER_USER = 5;
/** setTimeout no admite esperas mayores (≈24,8 días). */
const MAX_TIMER_MS = 2 ** 31 - 1;

@WebSocketGateway({
  // Solo los orígenes de CORS_ORIGINS (no '*'); además la conexión exige un JWT válido
  cors: {
    origin: socketCorsOrigin,
  },
  namespace: 'realtime',
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  /** Temporizador de caducidad de cada conexión (por id de socket). */
  private readonly expiry = new Map<string, NodeJS.Timeout>();

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    // El usuario se identifica únicamente por el JWT de acceso del handshake;
    // nunca por un userId enviado por el cliente.
    const token = client.handshake.auth?.token;
    if (!token || typeof token !== 'string') {
      client.disconnect(true);
      return;
    }
    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string; exp?: number }>(token, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        algorithms: ['HS256'],
      });
      const room = `user:${payload.sub}`;

      // Tope de conexiones por usuario: se cierran las más antiguas para dejar sitio a la nueva
      const open = await this.server.in(room).fetchSockets();
      const excess = open.length - (MAX_SOCKETS_PER_USER - 1);
      if (excess > 0) {
        [...open]
          .sort((a, b) => a.handshake.issued - b.handshake.issued)
          .slice(0, excess)
          .forEach((s) => s.disconnect(true));
      }

      await client.join(room);

      // La conexión no sobrevive al token con el que se abrió: al caducar se avisa y se corta.
      // El cliente debe reconectar con un access token renovado.
      if (payload.exp) {
        const ms = Math.max(0, payload.exp * 1000 - Date.now());
        const timer = setTimeout(() => {
          client.emit('auth:expired');
          client.disconnect(true);
        }, Math.min(ms, MAX_TIMER_MS));
        timer.unref?.();
        this.expiry.set(client.id, timer);
      }
    } catch {
      this.logger.debug('Conexión realtime rechazada: token inválido o expirado');
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const timer = this.expiry.get(client.id);
    if (timer) {
      clearTimeout(timer);
      this.expiry.delete(client.id);
    }
  }

  /** Corta todas las conexiones de un usuario (cierre de todas las sesiones, cambio de contraseña). */
  disconnectUser(userId: string) {
    if (this.server) {
      this.server.in(`user:${userId}`).disconnectSockets(true);
    }
  }

  /** Evento genérico para todos los dispositivos de un usuario (p. ej. aviso de pelea al defensor). */
  emitToUser(userId: string, event: string, payload: unknown) {
    if (this.server) {
      this.server.to(`user:${userId}`).emit(event, payload);
    }
  }

  emitPetUpdate(userId: string, pet: any) {
    if (this.server) {
      this.server.to(`user:${userId}`).emit('pet:update', pet);
    }
  }
}
