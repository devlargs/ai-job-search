import { describe, expect, it } from 'vitest';
import { groupIntoTiers, tierOf, TIER_BOUNDS_MS } from './feed-tiers.js';

const now = new Date('2026-11-27T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs).toISOString();

describe('tierOf', () => {
  it('puts exactly 24h in fresh', () => expect(tierOf(at(-TIER_BOUNDS_MS.fresh), now)).toBe('fresh'));
  it('puts 24h + 1ms in recent', () => expect(tierOf(at(-TIER_BOUNDS_MS.fresh - 1), now)).toBe('recent'));
  it('puts exactly 72h in recent', () => expect(tierOf(at(-TIER_BOUNDS_MS.recent), now)).toBe('recent'));
  it('puts 72h + 1ms in older', () => expect(tierOf(at(-TIER_BOUNDS_MS.recent - 1), now)).toBe('older'));
  it('puts a future date in fresh', () => expect(tierOf(at(HOUR), now)).toBe('fresh'));
  it('bounds are 24h and 72h', () => expect(TIER_BOUNDS_MS).toEqual({ fresh: 24 * HOUR, recent: 72 * HOUR }));
});

describe('groupIntoTiers', () => {
  it('places fixture ages one per tier', () => {
    const items = [
      { id: 'old', effectiveDate: at(-5 * 24 * HOUR) },
      { id: 'mid', effectiveDate: at(-30 * HOUR) },
      { id: 'new', effectiveDate: at(-2 * HOUR) },
    ];
    const tiers = groupIntoTiers(items, now);
    expect(tiers.fresh.map((i) => i.id)).toEqual(['new']);
    expect(tiers.recent.map((i) => i.id)).toEqual(['mid']);
    expect(tiers.older.map((i) => i.id)).toEqual(['old']);
  });

  it('orders a tier by effectiveDate desc when scores are null or absent', () => {
    const items = [
      { id: 'a', effectiveDate: at(-10 * HOUR) },
      { id: 'b', effectiveDate: at(-1 * HOUR), score: null },
      { id: 'c', effectiveDate: at(-5 * HOUR) },
    ];
    expect(groupIntoTiers(items, now).fresh.map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('orders by score desc with null last, ties by effectiveDate desc', () => {
    const items = [
      { id: 'null-new', effectiveDate: at(-1 * HOUR), score: null },
      { id: '40', effectiveDate: at(-2 * HOUR), score: 40 },
      { id: '80-old', effectiveDate: at(-6 * HOUR), score: 80 },
      { id: '80-new', effectiveDate: at(-3 * HOUR), score: 80 },
      { id: 'null-old', effectiveDate: at(-8 * HOUR) },
    ];
    expect(groupIntoTiers(items, now).fresh.map((i) => i.id)).toEqual(['80-new', '80-old', '40', 'null-new', 'null-old']);
  });

  it('returns three empty tiers for no items', () => {
    expect(groupIntoTiers([], now)).toEqual({ fresh: [], recent: [], older: [] });
  });

  it('does not mutate the input', () => {
    const items = [
      { id: 'a', effectiveDate: at(-10 * HOUR) },
      { id: 'b', effectiveDate: at(-1 * HOUR) },
    ];
    groupIntoTiers(items, now);
    expect(items.map((i) => i.id)).toEqual(['a', 'b']);
  });
});
