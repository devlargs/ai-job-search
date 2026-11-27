import type { ListingDraft, SourceId } from '@ai-job-search/shared';

/** Injection token for the array of registered sources. */
export const JOB_SOURCES = Symbol('JOB_SOURCES');

/**
 * One job board behind the ingestion pipeline (AD-2). Adapters only fetch and
 * map; they never persist, sanitize, tag or score. A failing adapter throws.
 */
export interface JobSource {
  readonly id: SourceId;
  /** The board's known eligibility default. Unused until eligibility tagging lands. */
  readonly eligibilityHint?: string;
  /** Minimum minutes between runs of any outcome; the pipeline enforces it. */
  readonly minIntervalMin?: number;
  fetch(since: Date | null): Promise<ListingDraft[]>;
}
