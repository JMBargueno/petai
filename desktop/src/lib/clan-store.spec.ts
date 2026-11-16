import { describe, expect, it, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  appendClanMessage,
  clanMemberActions,
  clanRole,
  hasClanRank,
  clearClan,
  dropClanGoal,
  goalPercent,
  mergeClanGoal,
  pushClanMessage,
  removeClanGoal,
  setClanGoals,
  setClanMessages,
  upsertClanGoal,
  clanGoalsStore,
  clanMessagesStore,
} from './clan-store';
import type { ClanGoal, ClanMessage } from './api';

const msg = (id: string, body = 'hola'): ClanMessage => ({
  id,
  clanId: 'c1',
  userId: 'u1',
  senderName: 'Luis',
  body,
  createdAt: '2024-01-01T00:00:00Z',
});
const goal = (id: string, over: Partial<ClanGoal> = {}): ClanGoal => ({
  id,
  clanId: 'c1',
  title: 'Meta',
  description: '',
  metric: 'xp',
  target: 100,
  progress: 0,
  status: 'active',
  createdAt: '2024-01-01T00:00:00Z',
  ...over,
});

beforeEach(() => {
  clearClan();
});

describe('appendClanMessage', () => {
  it('añade al final y evita duplicados por id', () => {
    let list: ClanMessage[] = [];
    list = appendClanMessage(list, msg('a'));
    list = appendClanMessage(list, msg('b'));
    list = appendClanMessage(list, msg('a')); // duplicado
    expect(list.map((m) => m.id)).toEqual(['a', 'b']);
  });
});

describe('mergeClanGoal / removeClanGoal', () => {
  it('añade y actualiza por id', () => {
    let list: ClanGoal[] = [];
    list = mergeClanGoal(list, goal('g1', { progress: 10 }));
    list = mergeClanGoal(list, goal('g1', { progress: 42 }));
    list = mergeClanGoal(list, goal('g2'));
    expect(list).toHaveLength(2);
    expect(list.find((g) => g.id === 'g1')?.progress).toBe(42);
    list = removeClanGoal(list, 'g1');
    expect(list.map((g) => g.id)).toEqual(['g2']);
  });
});

describe('goalPercent', () => {
  it('limita a 0-100 y redondea', () => {
    expect(goalPercent({ progress: 0, target: 0 })).toBe(0); // sin meta
    expect(goalPercent({ progress: 50, target: 100 })).toBe(50);
    expect(goalPercent({ progress: 999, target: 100 })).toBe(100); // exceso
    expect(goalPercent({ progress: 1, target: 3 })).toBe(33);
  });
});

describe('stores', () => {
  it('pushClanMessage / setClanMessages', () => {
    setClanMessages([msg('a')]);
    expect(get(clanMessagesStore).map((m) => m.id)).toEqual(['a']);
    pushClanMessage(msg('b'));
    expect(get(clanMessagesStore).map((m) => m.id)).toEqual(['a', 'b']);
    pushClanMessage(msg('b')); // duplicado
    expect(get(clanMessagesStore)).toHaveLength(2);
  });

  it('upsertClanGoal / setClanGoals / dropClanGoal / clearClan', () => {
    setClanGoals([goal('g1', { progress: 10 })]);
    upsertClanGoal(goal('g1', { progress: 55 }));
    upsertClanGoal(goal('g2', { progress: 5 }));
    expect(get(clanGoalsStore).find((g) => g.id === 'g1')?.progress).toBe(55);
    dropClanGoal('g1');
    expect(get(clanGoalsStore).map((g) => g.id)).toEqual(['g2']);
    clearClan();
    expect(get(clanGoalsStore)).toEqual([]);
    expect(get(clanMessagesStore)).toEqual([]);
  });
});


describe('rangos del Nexo (clanMemberActions)', () => {
  it('normaliza el rol heredado leader a creator', () => {
    expect(clanRole('leader')).toBe('creator');
    expect(clanRole('raro')).toBe('member');
    expect(hasClanRank('leader', 'admin')).toBe(true);
  });

  it('un Hermano no puede gestionar a nadie', () => {
    expect(clanMemberActions('member', 'member')).toEqual({ kick: false, promote: null, demote: null, transfer: false });
  });

  it('un Vigía solo expulsa a Hermanos', () => {
    expect(clanMemberActions('moderator', 'member')).toMatchObject({ kick: true, promote: null, demote: null });
    expect(clanMemberActions('moderator', 'moderator').kick).toBe(false);
  });

  it('un Guardián nombra o retira Vigías pero no Guardianes', () => {
    expect(clanMemberActions('admin', 'member')).toMatchObject({ kick: true, promote: 'moderator', demote: null });
    expect(clanMemberActions('admin', 'moderator')).toMatchObject({ kick: true, promote: null, demote: 'member' });
    expect(clanMemberActions('admin', 'admin')).toMatchObject({ kick: false, promote: null, demote: null });
  });

  it('el Forjador nombra Guardianes y puede ceder la Forja', () => {
    expect(clanMemberActions('creator', 'moderator')).toMatchObject({ promote: 'admin', demote: 'member', transfer: true });
    expect(clanMemberActions('creator', 'admin')).toMatchObject({ kick: true, promote: null, demote: 'moderator', transfer: true });
  });
});
