const HOUR_MS = 60 * 60 * 1000;

/** Upper bounds of each tier, inclusive (AD-4). Anything beyond `recent` is `older`. */
export const TIER_BOUNDS_MS = { fresh: 24 * HOUR_MS, recent: 72 * HOUR_MS } as const;

export type Tier = 'fresh' | 'recent' | 'older';

/** The tier an `effectiveDate` falls in at `now`. A future date (clock skew) is `fresh`. */
export function tierOf(effectiveDate: string | Date, now: Date): Tier {
  const age = now.getTime() - new Date(effectiveDate).getTime();
  if (age <= TIER_BOUNDS_MS.fresh) return 'fresh';
  if (age <= TIER_BOUNDS_MS.recent) return 'recent';
  return 'older';
}

type Tierable = { effectiveDate: string; score?: number | null };

/** Score descending with null last, then `effectiveDate` descending. */
function compare(a: Tierable, b: Tierable): number {
  const sa = a.score ?? null;
  const sb = b.score ?? null;
  if (sa !== sb) {
    if (sa === null) return 1;
    if (sb === null) return -1;
    return sb - sa;
  }
  return new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime();
}

/** Groups items into freshness tiers at `now` and sorts each tier. Pure: does not mutate `items`. */
export function groupIntoTiers<T extends Tierable>(items: readonly T[], now: Date): Record<Tier, T[]> {
  const tiers: Record<Tier, T[]> = { fresh: [], recent: [], older: [] };
  for (const item of items) tiers[tierOf(item.effectiveDate, now)].push(item);
  tiers.fresh.sort(compare);
  tiers.recent.sort(compare);
  tiers.older.sort(compare);
  return tiers;
}
