import { Inject, Injectable } from '@nestjs/common';
import { SourceId, type FeedItem, type FeedResponse } from '@ai-job-search/shared';
import { ListingsReader, type FeedListing } from '../ingestion/listings-reader.js';
import { matchScore } from '../matching/match-score.js';
import { ResumeSkills } from '../resume/resume-skills.js';
import { groupIntoTiers } from './feed-tiers.js';

/** Scored listings below this are hidden (AD-4 step 4). Story 1.7 makes it the preference's `minMatch` (AD-9). */
export const DEFAULT_MIN_MATCH = 40;

@Injectable()
export class ListingsService {
  constructor(
    private readonly reader: ListingsReader,
    @Inject(ResumeSkills) private readonly resume: ResumeSkills,
  ) {}

  /**
   * The feed at `now` (AD-4): non-restricted listings, each scored against the
   * resume skill set, scored ones below minMatch dropped, then grouped into
   * freshness tiers. No resume module yet, so `resumeStatus` is always `none`.
   */
  async getFeed(now: Date = new Date()): Promise<FeedResponse> {
    const [docs, resumeSkills] = await Promise.all([this.reader.findFeed(), this.resume.resumeSkillSet()]);
    const items = docs
      .map((doc) => toFeedItem(doc, matchScore(doc.skills ?? [], resumeSkills)))
      .filter((item) => item.score === null || item.score >= DEFAULT_MIN_MATCH);
    return { resumeStatus: 'none', tiers: groupIntoTiers(items, now) };
  }
}

export function toFeedItem(doc: FeedListing, score: number | null): FeedItem {
  return {
    id: doc._id.toString(),
    source: SourceId.parse(doc.source),
    title: doc.title,
    company: doc.company,
    url: doc.url,
    locationText: doc.locationText ?? null,
    effectiveDate: new Date(doc.effectiveDate).toISOString(),
    // A row stored before tagging landed has no eligibility until the boot re-derive reaches it.
    eligibility: doc.eligibility ?? 'unknown',
    score,
  };
}
