import { z } from 'zod';
import { FeedItem } from './feed.schema.js';

/**
 * One listing opened in full (R8): a feed item without its score, plus the
 * sanitized description and both dates. Dates are ISO 8601 UTC strings.
 */
export const ListingDetail = FeedItem.omit({ score: true }).extend({
  /** Sanitized by the one allowlist sanitizer; rendered only through `JobDescription`. */
  descriptionHtml: z.string(),
  postedAt: z.iso.datetime().nullable(),
  firstSeenAt: z.iso.datetime(),
});
export type ListingDetail = z.infer<typeof ListingDetail>;
