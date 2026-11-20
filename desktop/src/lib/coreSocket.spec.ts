import { describe, expect, it, vi } from 'vitest';
import type { RealtimeEvent } from '@pockai/client';
import { CoreSocket, type CoreRealtime } from './coreSocket';

/** Núcleo simulado: guarda los suscriptores para poder emitirles eventos desde el test. */
function fakeCore() {
  let onEvent: (event: RealtimeEvent) => void = () => {};
  let onStatus: (connected: boolean) => void = () => {};
  const stopEvents = vi.fn();
  const stopStatus = vi.fn();
  const core: CoreRealtime = {
    onRealtime: async (cb) => ((onEvent = cb), stopEvents),
    onRealtimeStatus: async (cb) => ((onStatus = cb), stopStatus),
    realtimeStart: vi.fn(async () => {}),
    realtimeStop: vi.fn(async () => {}),
  };
  return {
    core,
    stopEvents,
    stopStatus,
    emit: (name: string, payload: unknown) => onEvent({ name, payload }),
    status: (connected: boolean) => onStatus(connected),
  };
}

describe('CoreSocket', () => {
  it('reparte los eventos del núcleo a quien se suscribe', async () => {
    const fake = fakeCore();
    const socket = new CoreSocket(fake.core);
    const updates: unknown[] = [];
    socket.on('pet:update', (pet) => updates.push(pet));
    await socket.open();

    fake.emit('pet:update', { id: 'p1' });
    fake.emit('clan:message', { id: 'm1' });

    expect(fake.core.realtimeStart).toHaveBeenCalledOnce();
    expect(updates).toEqual([{ id: 'p1' }]);
  });

  it('refleja la conexión y avisa con connect y disconnect', async () => {
    const fake = fakeCore();
    const socket = new CoreSocket(fake.core);
    const seen: string[] = [];
    socket.on('connect', () => seen.push('connect'));
    socket.on('disconnect', (reason) => seen.push(`disconnect:${reason}`));
    await socket.open();

    expect(socket.connected).toBe(false);
    fake.status(true);
    expect(socket.connected).toBe(true);
    fake.status(false);
    expect(socket.connected).toBe(false);
    expect(seen).toEqual(['connect', 'disconnect:transport close']);
  });

  it('once atiende una sola vez y off la retira antes', async () => {
    const fake = fakeCore();
    const socket = new CoreSocket(fake.core);
    const first = vi.fn();
    const removed = vi.fn();
    socket.once('connect', first);
    socket.once('connect', removed);
    socket.off('connect', removed);
    await socket.open();

    fake.status(true);
    fake.status(true);

    expect(first).toHaveBeenCalledOnce();
    expect(removed).not.toHaveBeenCalled();
  });

  it('un fallo en un suscriptor no deja sin evento a los demás', async () => {
    const fake = fakeCore();
    const socket = new CoreSocket(fake.core);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ok = vi.fn();
    socket.on('pet:update', () => {
      throw new Error('boom');
    });
    socket.on('pet:update', ok);
    await socket.open();

    fake.emit('pet:update', {});

    expect(ok).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  it('al cerrarlo deja de escuchar y para el canal del núcleo', async () => {
    const fake = fakeCore();
    const socket = new CoreSocket(fake.core);
    const handler = vi.fn();
    socket.on('pet:update', handler);
    await socket.open();

    socket.disconnect();

    expect(socket.active).toBe(false);
    expect(fake.stopEvents).toHaveBeenCalledOnce();
    expect(fake.stopStatus).toHaveBeenCalledOnce();
    expect(fake.core.realtimeStop).toHaveBeenCalledOnce();
  });

  it('si se cierra antes de terminar de abrirse no arranca el canal', async () => {
    const fake = fakeCore();
    const socket = new CoreSocket(fake.core);
    const opening = socket.open();
    socket.disconnect();
    await opening;

    expect(fake.core.realtimeStart).not.toHaveBeenCalled();
    expect(fake.stopEvents).toHaveBeenCalledOnce();
  });
});
