import { RealtimeGateway } from './realtime.gateway';

function fakeSocket(id: string, token?: unknown, issued = Date.now()) {
  return {
    id,
    handshake: { auth: { token }, issued },
    join: jest.fn(async () => undefined),
    emit: jest.fn(),
    disconnect: jest.fn(),
  } as any;
}

describe('RealtimeGateway', () => {
  const NOW = new Date('2026-01-01T00:00:00Z').getTime();
  let open: any[];
  let disconnectSockets: jest.Mock;
  let gateway: RealtimeGateway;
  let verifyAsync: jest.Mock;
  let presence: any;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    open = [];
    disconnectSockets = jest.fn();
    verifyAsync = jest.fn(async () => ({ sub: 'u1', exp: NOW / 1000 + 900 }));
    presence = {
      heartbeat: jest.fn(async () => undefined),
      removeDevice: jest.fn(async () => undefined),
    };
    gateway = new RealtimeGateway(
      { verifyAsync } as any,
      { get: () => 'secreto' } as any,
      { incSocketConnections: jest.fn(), recordSseStream: jest.fn() } as any,
      presence,
    );
    gateway.server = { in: jest.fn(() => ({ fetchSockets: async () => open, disconnectSockets })) } as any;
  });
  afterEach(() => jest.useRealTimers());

  it('rechaza conexiones sin token o con token inválido', async () => {
    const none = fakeSocket('a');
    await gateway.handleConnection(none);
    expect(none.disconnect).toHaveBeenCalledWith(true);

    verifyAsync.mockRejectedValueOnce(new Error('jwt expired'));
    const bad = fakeSocket('b', 'tok');
    await gateway.handleConnection(bad);
    expect(bad.disconnect).toHaveBeenCalledWith(true);
    expect(bad.join).not.toHaveBeenCalled();
  });

  it('solo acepta HS256 y une al usuario del token, no al que diga el cliente', async () => {
    const s = fakeSocket('a', 'tok');
    await gateway.handleConnection(s);
    expect(verifyAsync).toHaveBeenCalledWith('tok', expect.objectContaining({ algorithms: ['HS256'] }));
    expect(s.join).toHaveBeenCalledWith('user:u1');
    expect(s.disconnect).not.toHaveBeenCalled();
  });

  it('corta la conexión cuando caduca el token con el que se abrió', async () => {
    const s = fakeSocket('a', 'tok');
    await gateway.handleConnection(s);
    jest.advanceTimersByTime(899_000);
    expect(s.disconnect).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2_000);
    expect(s.emit).toHaveBeenCalledWith('auth:expired');
    expect(s.disconnect).toHaveBeenCalledWith(true);
  });

  it('si el cliente se desconecta antes, el temporizador se cancela', async () => {
    const s = fakeSocket('a', 'tok');
    await gateway.handleConnection(s);
    gateway.handleDisconnect(s);
    jest.advanceTimersByTime(1_000_000);
    expect(s.disconnect).not.toHaveBeenCalled();
  });

  it('con el máximo de conexiones abiertas cierra las más antiguas', async () => {
    open = [1, 2, 3, 4, 5, 6].map((n) => fakeSocket(`old${n}`, 'tok', NOW - n * 1000)); // old6 es la más antigua
    const s = fakeSocket('new', 'tok');
    await gateway.handleConnection(s);
    const closed = open.filter((o) => o.disconnect.mock.calls.length > 0).map((o) => o.id);
    expect(closed.sort()).toEqual(['old5', 'old6']); // quedan 4 + la nueva = 5
    expect(s.join).toHaveBeenCalled();
  });

  it('registra la presencia (heartbeat) al conectar y la retira (removeDevice) al desconectar', async () => {
    const s = fakeSocket('a', 'tok');
    s.handshake.auth.deviceId = 'dev-1';
    s.handshake.auth.platform = 'web';
    await gateway.handleConnection(s);
    expect(presence.heartbeat).toHaveBeenCalledWith('u1', 'dev-1', 'web');

    gateway.handleDisconnect(s);
    expect(presence.removeDevice).toHaveBeenCalledWith('u1', 'dev-1');
    // Tras el desconecte el refresco queda detenido: avanzar el reloj no repite heartbeats.
    const callsAfterDisconnect = presence.heartbeat.mock.calls.length;
    jest.advanceTimersByTime(31_000);
    expect(presence.heartbeat.mock.calls.length).toBe(callsAfterDisconnect);
  });

  it('disconnectUser corta todas las conexiones del usuario', () => {
    gateway.disconnectUser('u9');
    expect((gateway.server as any).in).toHaveBeenCalledWith('user:u9');
    expect(disconnectSockets).toHaveBeenCalledWith(true);
  });

  it('emitPetAction envía `pet:action` solo a la sala del usuario', () => {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    gateway.server = { to } as any;

    gateway.emitPetAction('u1', 'p1', 'level_up', { level: 3 });
    gateway.emitPetAction('u1', null, 'achievement');

    expect(to).toHaveBeenCalledWith('user:u1');
    expect(emit).toHaveBeenNthCalledWith(1, 'pet:action', { petId: 'p1', action: 'level_up', context: { level: 3 } });
    expect(emit).toHaveBeenNthCalledWith(2, 'pet:action', { petId: null, action: 'achievement' });
  });
});
