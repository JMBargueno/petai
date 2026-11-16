import { describe, expect, it, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  appendClanMessage,
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
