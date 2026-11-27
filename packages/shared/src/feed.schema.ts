import { z } from 'zod';
import { Eligibility } from './eligibility.js';
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
  eligibility: Eligibility,
});
export type FeedItem = z.infer<typeof FeedItem>;

export const ResumeStatus = z.enum(['none', 'draft', 'confirmed']);
export type ResumeStatus = z.infer<typeof ResumeStatus>;

/** Freshness tiers by `effectiveDate` age (AD-4): fresh ≤ 24h, recent ≤ 72h, older beyond. */
export const FeedTiers = z.object({
  fresh: z.array(FeedItem),
  recent: z.array(FeedItem),
  older: z.array(FeedItem),
});
export type FeedTiers = z.infer<typeof FeedTiers>;

export const FeedResponse = z.object({
  resumeStatus: ResumeStatus,
  tiers: FeedTiers,
});
export type FeedResponse = z.infer<typeof FeedResponse>;
