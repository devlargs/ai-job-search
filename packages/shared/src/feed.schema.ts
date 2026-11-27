import { z } from 'zod';
import { SourceId } from './source-id.js';

export const FeedItem = z.object({
  id: z.string(),
  source: SourceId,
  title: z.string(),
  company: z.string(),
  url: z.string(),
  locationText: z.string().nullable(),
  /** ISO 8601 UTC string. */
  effectiveDate: z.iso.datetime(),
});
export type FeedItem = z.infer<typeof FeedItem>;

export const FeedResponse = z.object({
  items: z.array(FeedItem),
});
export type FeedResponse = z.infer<typeof FeedResponse>;
