import { describe, expect, it } from 'vitest';
import { effectiveDate } from './effective-date.js';

const now = new Date('2026-11-27T12:00:00.000Z');
const firstSeenAt = now;

describe('effectiveDate', () => {
  it('falls back to firstSeenAt when postedAt is null', () => {
    expect(effectiveDate(null, firstSeenAt, now)).toBe(firstSeenAt);
  });

  it('falls back to firstSeenAt when postedAt is in the future', () => {
    const future = new Date(now.getTime() + 60 * 60_000);
    expect(effectiveDate(future, firstSeenAt, now)).toBe(firstSeenAt);
  });

  it('falls back to firstSeenAt when postedAt is after firstSeenAt', () => {
    const earlierFirstSeen = new Date('2026-11-20T00:00:00.000Z');
    const posted = new Date('2026-11-21T00:00:00.000Z');
    expect(effectiveDate(posted, earlierFirstSeen, now)).toBe(earlierFirstSeen);
  });

  it('uses postedAt when it is in the past and before firstSeenAt', () => {
    const posted = new Date('2026-11-25T11:26:35.000Z');
    expect(effectiveDate(posted, firstSeenAt, now)).toBe(posted);
  });

  it('uses postedAt when it equals firstSeenAt', () => {
    const posted = new Date(firstSeenAt.getTime());
    expect(effectiveDate(posted, firstSeenAt, now)).toBe(posted);
  });

  it('falls back to firstSeenAt for an invalid date', () => {
    expect(effectiveDate(new Date('nope'), firstSeenAt, now)).toBe(firstSeenAt);
  });
});
