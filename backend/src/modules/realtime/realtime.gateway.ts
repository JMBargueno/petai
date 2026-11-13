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
import { MetricsService } from '../../observability/metrics.service';
import { startSpanFromRemoteTrace } from '../../observability/otel-context';
import { SPAN_HEADER, TRACE_HEADER } from '../../observability/otel.constants';

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
  /** Span de conexión por socket (para correlación y cierre). */
  private readonly connSpans = new Map<string, import('@opentelemetry/api').Span>();
  /** Instante de conexión por socket, para medir la duración del stream (métrica SSE, gap G5). */
  private readonly connStart = new Map<string, number>();

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly metrics: MetricsService,
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

      // Correlación de trace (US3): el cliente puede enviar `x-trace-id`/`x-span-id` en el
      // handshake para enlazar el flujo REST → WebSocket. Si no hay, se abre un nuevo trace.
      const [headerTraceId, headerSpanId] = this.readTraceContext(client);
      const { span } = startSpanFromRemoteTrace('realtime.connection', headerTraceId, headerSpanId, {
        'messaging.system': 'socketio',
        'messaging.destination': 'realtime',
      });
      this.connSpans.set(client.id, span);
      this.connStart.set(client.id, Date.now());
      this.metrics.incSocketConnections(1);

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
    // Cerramos el span de conexión y actualizamos el gauge solo si la conexión fue contada.
    const span = this.connSpans.get(client.id);
    if (span) {
      try {
        span.end();
      } catch {
        /* noop */
      }
      this.connSpans.delete(client.id);
      this.metrics.incSocketConnections(-1);
      // Métrica de stream en vivo (gap G5 / T024): la duración de la conexión se registra en
      // `petai_sse_stream_duration_seconds{stream_type="realtime"}`; antes el helper `recordSseStream`
      // nunca se llamaba y la serie quedaba vacía (afecta al dashboard "WebSocket").
      const startedAt = this.connStart.get(client.id);
      this.connStart.delete(client.id);
      if (typeof startedAt === 'number') {
        this.metrics.recordSseStream('realtime', (Date.now() - startedAt) / 1000);
      }
    }
  }

  /** Lee `x-trace-id` / `x-span-id` de los headers del handshake de Socket.IO. */
  private readTraceContext(client: Socket): [string | undefined, string | undefined] {
    const headers = (client.handshake?.headers ?? {}) as Record<string, unknown>;
    const traceHeader = headers[TRACE_HEADER] as string | undefined;
    const spanHeader = headers[SPAN_HEADER] as string | undefined;
    return [typeof traceHeader === 'string' ? traceHeader : undefined, typeof spanHeader === 'string' ? spanHeader : undefined];
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
