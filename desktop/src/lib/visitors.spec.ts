import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
  acceptedFriends,
  clearVisitors,
  friendPetLabel,
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
