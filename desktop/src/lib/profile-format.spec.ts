import { describe, expect, it } from 'vitest';
import { formatCount, formatPlayTime, formatProgress, progressRatio, sortBadges, toggleFeatured } from './profile-format';

describe('profile-format', () => {
  it('formatPlayTime', () => {
    expect(formatPlayTime(0)).toBe('0 min');
    expect(formatPlayTime(45)).toBe('45 min');
    expect(formatPlayTime(60)).toBe('1 h');
    expect(formatPlayTime(200)).toBe('3 h 20 min');
    expect(formatPlayTime(100 * 60 + 5)).toBe('100 h');
  });

  it('formatCount', () => {
    expect(formatCount(950)).toBe('950');
    expect(formatCount(1000)).toBe('1 k');
    expect(formatCount(1200)).toBe('1,2 k');
    expect(formatCount(12_345)).toBe('12 k');
    expect(formatCount(1_500_000)).toBe('1,5 M');
  });

  it('formatProgress muestra horas en los logros de tiempo', () => {
    expect(formatProgress('time_10h', 7200, 36000)).toBe('2/10 h');
    expect(formatProgress('care_feed_50', 12, 50)).toBe('12/50');
  });

  it('progressRatio acota entre 0 y 1', () => {
    expect(progressRatio(5, 10)).toBe(0.5);
    expect(progressRatio(50, 10)).toBe(1);
    expect(progressRatio(1, 0)).toBe(0);
  });

  it('sortBadges: tier más alto y más reciente primero', () => {
    const out = sortBadges([
      { id: 'a', tier: 'common', unlockedAt: '2026-11-10' },
      { id: 'b', tier: 'legendary', unlockedAt: '2026-01-01' },
      { id: 'c', tier: 'common', unlockedAt: '2026-11-15' },
    ]);
    expect(out.map((b) => b.id)).toEqual(['b', 'c', 'a']);
  });

  it('toggleFeatured: añade, quita y respeta el máximo', () => {
    expect(toggleFeatured(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleFeatured(['a', 'b'], 'a')).toEqual(['b']);
    expect(toggleFeatured(['a', 'b', 'c'], 'd')).toBeNull();
  });
});
