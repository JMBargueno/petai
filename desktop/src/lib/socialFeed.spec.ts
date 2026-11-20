import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
  clanGoalsStore,
  clanHabitatEvents,
  clanMessagesStore,
  clanRosterTick,
  clearClan,
  clearVisitors,
  connectSocialFeed,
  visitScene,
  visitorsStore,
} from '@pockai/ui/social';

/** Una fuente de eventos de mentira: guarda los handlers y deja emitir. */
function fakeSource() {
  const handlers = new Map<string, Set<(payload: any) => void>>();
  return {
    on(event: string, handler: (payload: any) => void) {
      const set = handlers.get(event) ?? new Set();
      set.add(handler);
      handlers.set(event, set);
      return () => set.delete(handler);
    },
    emit(event: string, payload: unknown) {
      for (const h of handlers.get(event) ?? []) h(payload);
    },
    count: () => [...handlers.values()].reduce((n, s) => n + s.size, 0),
  };
}

describe('connectSocialFeed', () => {
  beforeEach(() => {
    clearVisitors();
    clearClan();
    visitScene.set(null);
  });

  it('refleja los visitantes del hábitat y la escena que hacen juntos', () => {
    const src = fakeSource();
    connectSocialFeed(src.on);

    src.emit('habitat:visitor_joined', { visitorId: 'u2', visitorName: 'Marta' });
    src.emit('habitat:visitor_joined', { visitorName: 'sin id' });
    expect(get(visitorsStore).map((v) => v.visitorId)).toEqual(['u2']);

    src.emit('habitat:scene', { visitorId: 'u2', type: 'play_tag' });
    expect(get(visitScene)?.type).toBe('play_tag');

    src.emit('habitat:visitor_left', { visitorId: 'u2' });
    expect(get(visitorsStore)).toEqual([]);
    // Al irse el visitante, su escena se olvida
    expect(get(visitScene)).toBeNull();
  });

  it('refleja el chat, los objetivos y los cambios del clan', () => {
    const src = fakeSource();
    connectSocialFeed(src.on);

    src.emit('clan:message', { id: 'm1', clanId: 'c1', body: 'Hola' });
    src.emit('clan:message', { id: 'm1', clanId: 'c1', body: 'Hola' });
    expect(get(clanMessagesStore).map((m) => m.id)).toEqual(['m1']);
    src.emit('clan:message_deleted', { id: 'm1' });
    expect(get(clanMessagesStore)).toEqual([]);

    src.emit('clan:goal_progress', { id: 'g1', clanId: 'c1', title: 'Visitas', progress: 3, target: 10 });
    src.emit('clan:goal_completed', { id: 'g1', clanId: 'c1', title: 'Visitas', progress: 10, target: 10 });
    expect(get(clanGoalsStore)[0]?.progress).toBe(10);
    expect(get(clanHabitatEvents)).toMatchObject({ kind: 'goal', clanId: 'c1', title: 'Visitas' });

    src.emit('clan:xp', { clanId: 'c1', xp: 340 });
    expect(get(clanHabitatEvents)).toMatchObject({ kind: 'xp', clanId: 'c1', xp: 340 });

    const tick = get(clanRosterTick);
    src.emit('clan:role_changed', {});
    src.emit('clan:member_kicked', {});
    expect(get(clanRosterTick)).toBe(tick + 2);
  });

  it('al pararlo deja de escuchar', () => {
    const src = fakeSource();
    const stop = connectSocialFeed(src.on);
    expect(src.count()).toBeGreaterThan(0);
    stop();
    expect(src.count()).toBe(0);
    src.emit('habitat:visitor_joined', { visitorId: 'u3' });
    expect(get(visitorsStore)).toEqual([]);
  });
});
