/**
 * AD-3: a listing's freshness date. `postedAt` counts only when it is set,
 * not in the future, and not later than `firstSeenAt`; otherwise `firstSeenAt`.
 */
export function effectiveDate(postedAt: Date | null, firstSeenAt: Date, now: Date = new Date()): Date {
  if (postedAt === null || Number.isNaN(postedAt.getTime())) return firstSeenAt;
  if (postedAt.getTime() > now.getTime()) return firstSeenAt;
  if (postedAt.getTime() > firstSeenAt.getTime()) return firstSeenAt;
  return postedAt;
}
