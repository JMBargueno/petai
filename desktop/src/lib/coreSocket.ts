import { onRealtime, onRealtimeStatus, realtimeStart, realtimeStop, type RealtimeEvent } from '@pockai/client';

type Handler = (...args: any[]) => void;

/** Lo que `CoreSocket` necesita del núcleo (inyectable en los tests). */
export interface CoreRealtime {
  onRealtime(cb: (event: RealtimeEvent) => void): Promise<() => void>;
  onRealtimeStatus(cb: (connected: boolean) => void): Promise<() => void>;
  realtimeStart(): Promise<void>;
  realtimeStop(): Promise<void>;
}

/**
 * El canal en tiempo real visto desde la UI cuando lo lleva el núcleo (Rust). Tiene la parte de la
 * interfaz de socket.io que usa la app (`on`, `once`, `off`, `connected`, `disconnect`), así los
 * componentes no cambian. La conexión, el token y la reconexión son cosa del núcleo: aquí solo se
 * reparten los eventos que reenvía.
 */
export class CoreSocket {
  connected = false;
  private closed = false;
  private handlers = new Map<string, Set<Handler>>();
  private stops: Array<() => void> = [];

  constructor(private core: CoreRealtime = { onRealtime, onRealtimeStatus, realtimeStart, realtimeStop }) {}

  /** Igual que en socket.io: el canal sigue vivo (conectado o intentando reconectar). */
  get active(): boolean {
    return !this.closed;
  }

  /** Empieza a escuchar al núcleo y le pide que abra el canal. */
  async open(): Promise<void> {
    const stops = await Promise.all([
      this.core.onRealtime((event) => this.dispatch(event.name, event.payload)),
      this.core.onRealtimeStatus((connected) => {
        this.connected = connected;
        if (connected) this.dispatch('connect');
        else this.dispatch('disconnect', 'transport close');
      }),
    ]);
    if (this.closed) {
      stops.forEach((stop) => stop());
      return;
    }
    this.stops = stops;
    await this.core.realtimeStart();
  }

  on(event: string, cb: Handler): this {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(cb);
    return this;
  }

  once(event: string, cb: Handler): this {
    const wrapped: Handler & { original?: Handler } = (...args) => {
      this.off(event, wrapped);
      cb(...args);
    };
    wrapped.original = cb;
    return this.on(event, wrapped);
  }

  off(event: string, cb?: Handler): this {
    const set = this.handlers.get(event);
    if (!set) return this;
    if (!cb) {
      this.handlers.delete(event);
      return this;
    }
    for (const handler of set) {
      if (handler === cb || (handler as { original?: Handler }).original === cb) set.delete(handler);
    }
    return this;
  }

  disconnect(): this {
    if (this.closed) return this;
    this.closed = true;
    this.connected = false;
    this.stops.forEach((stop) => stop());
    this.stops = [];
    void this.core.realtimeStop().catch(() => {});
    return this;
  }

  private dispatch(event: string, ...args: unknown[]) {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        handler(...args);
      } catch (e) {
        console.error(`[tiempo real] fallo al atender «${event}»`, e);
      }
    }
  }
}
