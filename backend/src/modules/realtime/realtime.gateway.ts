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

@WebSocketGateway({
  // Solo los orígenes de CORS_ORIGINS (no '*'); además la conexión exige un JWT válido
  cors: {
    origin: socketCorsOrigin,
  },
  namespace: 'realtime',
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

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
      const payload = await this.jwtService.verifyAsync<{ sub: string }>(token, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      });
      await client.join(`user:${payload.sub}`);
    } catch {
      this.logger.debug('Conexión realtime rechazada: token inválido o expirado');
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {}

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
