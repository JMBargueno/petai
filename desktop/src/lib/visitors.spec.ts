import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
  acceptedFriends,
  clearVisitors,
  friendPetLabel,
  guestPetState,
  roomGuestOf,
  sceneLabel,
  sceneReceived,
  stageLabel,
  visitScene,
  pendingFriends,
  presenceState,
  removeVisitor,
  resolveVisitorSpriteKey,
  setVisitors,
  upsertVisitor,
  visitorJoined,
  visitorLeft,
  visitorSeed,
  visitorsStore,
} from './visitors';
import type { CoopFriend, HabitatVisitor, PetIdentity } from './api';

const pet = (over: Partial<PetIdentity> = {}): PetIdentity => ({
  petId: 'p1',
  nickname: 'Rex',
  speciesName: 'Igni',
  speciesId: 'ignisaur',
  spriteRef: 'sprites/ignisaur_idle',
  ...over,
});
const visitor = (id: string, name = 'Luis'): HabitatVisitor => ({
  visitorId: id,
  visitorName: name,
  pet: pet(),
  startedAt: '2024-01-01T00:00:00Z',
});
const friend = (over: Partial<CoopFriend> = {}): CoopFriend => ({
  id: 'f1',
  status: 'accepted',
  direction: 'incoming',
  otherUserId: 'u2',
  otherDisplayName: 'Luis',
  otherPet: { petId: 'p2', nickname: 'Rex', speciesName: 'Igni' },
  updatedAt: '2024-01-01T00:00:00Z',
  ...over,
});

describe('presenceState', () => {
  it('online si hay dispositivos activos', () => {
    expect(presenceState({ userId: 'u', devices: [], hasActiveDevices: true })).toBe('online');
  });
  it('offline si no hay dispositivos activos', () => {
    expect(presenceState({ userId: 'u', devices: [], hasActiveDevices: false })).toBe('offline');
  });
  it('unknown si la presencia no se pudo cargar', () => {
    expect(presenceState(null)).toBe('unknown');
    expect(presenceState(undefined)).toBe('unknown');
  });
});

describe('filtrado de amigos', () => {
  it('separa aceptados y pendientes', () => {
    const friends = [
      friend({ id: 'a', status: 'accepted' }),
      friend({ id: 'b', status: 'pending', direction: 'outgoing' }),
      friend({ id: 'c', status: 'revoked' }),
    ];
    expect(acceptedFriends(friends).map((f) => f.id)).toEqual(['a']);
    expect(pendingFriends(friends).map((f) => f.id)).toEqual(['b']);
  });
  it('aguenta listas nulas', () => {
    expect(acceptedFriends(null)).toEqual([]);
    expect(pendingFriends(undefined)).toEqual([]);
  });
});

describe('friendPetLabel', () => {
  it('muestra nombre y especie de la mascota del amigo', () => {
    expect(friendPetLabel(friend())).toBe('Rex (Igni)');
    expect(friendPetLabel(friend({ otherPet: null }))).toBe('Sin mascota');
    expect(friendPetLabel(friend({ otherPet: { petId: 'p', nickname: '', speciesName: 'Axo' } }))).toBe('Axo');
  });
});

describe('visita en vivo', () => {
  it('upsertVisitor añade y actualiza por visitorId', () => {
    let list = upsertVisitor([], visitor('u1'));
    expect(list).toHaveLength(1);
    list = upsertVisitor(list, visitor('u2', 'Ana'));
    expect(list.map((v) => v.visitorId)).toEqual(['u1', 'u2']);
    list = upsertVisitor(list, { ...visitor('u2', 'Ana'), startedAt: '2024-01-02T00:00:00Z' });
    expect(list).toHaveLength(2);
    expect(list[1].startedAt).toBe('2024-01-02T00:00:00Z');
  });

  it('removeVisitor quita solo al visitante indicado', () => {
    const list = [visitor('u1'), visitor('u2')];
    expect(removeVisitor(list, 'u1').map((v) => v.visitorId)).toEqual(['u2']);
    expect(removeVisitor(list, 'u3')).toHaveLength(2);
  });

  it('el store refleja joined/left/set y se limpia al cerrar sesión', () => {
    visitorJoined(visitor('u1'));
    expect(get(visitorsStore)).toHaveLength(1);
    visitorJoined(visitor('u1', 'Luis2')); // mismo id: se actualiza, no se duplica
    expect(get(visitorsStore)).toHaveLength(1);
    visitorJoined(visitor('u2'));
    visitorLeft('u1');
    expect(get(visitorsStore).map((v) => v.visitorId)).toEqual(['u2']);
    setVisitors([]);
    expect(get(visitorsStore)).toHaveLength(0);
    clearVisitors();
    expect(get(visitorsStore)).toHaveLength(0);
  });
});

describe('resolveVisitorSpriteKey', () => {
  it('prefiere speciesId si el cliente conoce la especie', () => {
    expect(resolveVisitorSpriteKey(pet({ speciesId: 'axolunar', spriteRef: 'ignisaur' }))).toBe('axolunar');
    expect(resolveVisitorSpriteKey(pet())).toBe('ignisaur');
  });
  it('usa spriteRef si speciesId no resuelve', () => {
    expect(resolveVisitorSpriteKey(pet({ speciesId: 'zorgling', spriteRef: 'florabud' }))).toBe('florabud');
  });
  it('cae a la especie por defecto si nada resuelve', () => {
    expect(resolveVisitorSpriteKey(pet({ speciesId: 'zorgling', spriteRef: 'sprites/zorgling_idle' }))).toBe('ignisaur');
    expect(resolveVisitorSpriteKey(null)).toBe('ignisaur');
    expect(resolveVisitorSpriteKey(undefined)).toBe('ignisaur');
  });
});

describe('visitorSeed', () => {
  it('es determinista por visitante y distinto entre ellos', () => {
    expect(visitorSeed('usuario-1')).toBe(visitorSeed('usuario-1'));
    expect(visitorSeed('usuario-1')).not.toBe(visitorSeed('usuario-2'));
    expect(Number.isFinite(visitorSeed('x'))).toBe(true);
  });
});

describe('visitante dentro de la sala', () => {
  const look = { palette: { primary: '#112233', secondary: '#445566' }, pattern: 'stripes', visualSeed: 42, shiny: true, accessories: { head: 'crown' } };
  const visitor = (over: Record<string, unknown> = {}, pet: Record<string, unknown> = {}): any => ({
    visitorId: 'u1',
    visitorName: 'Ana',
    startedAt: '2026-11-18T12:00:00Z',
    pet: { petId: 'p1', nickname: 'Brasa', speciesName: 'Ignisaur', speciesId: 'ignisaur', spriteRef: 'ignisaur', stage: 'adult', look, ...pet },
    ...over,
  });

  it('traduce el aspecto del visitante al de la escena', () => {
    expect(guestPetState(visitor())).toEqual({
      species: 'ignisaur',
      stage: 'adult',
      palette: { primary: '#112233', secondary: '#445566' },
      pattern: 'stripes',
      visualSeed: 42,
      shiny: true,
      accessories: { head: 'crown' },
    });
  });

  it('una especie o etapa desconocida cae a un valor que se puede dibujar', () => {
    const state = guestPetState(visitor({}, { speciesId: 'criatura_nueva', spriteRef: 'nada', stage: 'ancestral' }));
    expect(state?.species).toBe('ignisaur');
    expect(state?.stage).toBe('baby');
  });

  it('sin aspecto (servidor antiguo) no se dibuja dentro de la sala', () => {
    expect(guestPetState(visitor({}, { look: undefined }))).toBeNull();
    expect(guestPetState(null)).toBeNull();
  });

  it('en la sala cabe uno: el primero que trae aspecto', () => {
    const old = visitor({ visitorId: 'u0' }, { look: undefined });
    const a = visitor({ visitorId: 'u1' });
    const b = visitor({ visitorId: 'u2' });
    expect(roomGuestOf([old, a, b])?.visitorId).toBe('u1');
    expect(roomGuestOf([old])).toBeNull();
    expect(roomGuestOf([])).toBeNull();
  });

  it('describe la escena y la relación con palabras, y calla ante lo que no conoce', () => {
    expect(sceneLabel('play_tag')).toContain('pilla-pilla');
    expect(stageLabel('friend')).toBe('Son amigos');
    expect(sceneLabel('baile_raro')).toBe('');
    expect(stageLabel(undefined)).toBe('');
  });

  it('cada escena recibida se numera para poder repetirla; al irse el visitante se olvida', () => {
    const seen: any[] = [];
    const stop = visitScene.subscribe((s) => seen.push(s));
    const ev = { visitorId: 'u1', slot: 0, type: 'greet', stage: 'stranger', hostPetId: 'h', guestPetId: 'p1' };
    sceneReceived(ev);
    sceneReceived({ ...ev, slot: 1 });
    sceneReceived(null);
    sceneReceived({ ...ev, type: 7 } as any);
    const numbered = seen.filter(Boolean);
    expect(numbered).toHaveLength(2);
    expect(numbered[1].n).toBeGreaterThan(numbered[0].n);
    visitorLeft('otro');
    expect(seen[seen.length - 1]).not.toBeNull();
    visitorLeft('u1');
    expect(seen[seen.length - 1]).toBeNull();
    stop();
  });
});
