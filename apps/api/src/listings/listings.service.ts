import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DEFAULT_PREFERENCE, SourceId, type FeedItem, type FeedResponse, type ListingDetail, type Preference } from '@ai-job-search/shared';
import { ListingsReader, type DetailListing, type FeedListing } from '../ingestion/listings-reader.js';
import { sanitizeHtml } from '../ingestion/sanitize-html.js';
import { matchScore } from '../matching/match-score.js';
import { MatchingRules } from '../matching/matching.module.js';
import { passesPreference } from '../matching/preference-match.js';
import { PreferenceService } from '../preference/preference.service.js';
import { ResumeSkills } from '../resume/resume-skills.js';
import { groupIntoTiers } from './feed-tiers.js';

@Injectable()
export class ListingsService {
  private readonly logger = new Logger('Listings');

  constructor(
    private readonly reader: ListingsReader,
    @Inject(ResumeSkills) private readonly resume: ResumeSkills,
    @Inject(PreferenceService) private readonly preference: PreferenceService,
    @Inject(MatchingRules) private readonly rules: MatchingRules,
  ) {}

  /**
   * The feed at `now` (AD-4): non-restricted listings, filtered by the active
   * preference's keywords (AD-9), each scored against the resume skill set,
   * scored ones below the preference's minMatch dropped, then grouped into
   * freshness tiers. No resume module yet, so `resumeStatus` is always `none`.
   */
  async getFeed(now: Date = new Date()): Promise<FeedResponse> {
    const [docs, resumeSkills, pref] = await Promise.all([
      this.reader.findFeed(),
      this.readResumeSkills(),
      this.readPreference(),
    ]);
    const items = docs
      .filter((doc) => passesPreference({ title: doc.title, skills: doc.skills }, pref.roleKeywords, this.rules.skills))
      .map((doc) => toFeedItem(doc, matchScore(doc.skills ?? [], resumeSkills)))
      .filter((item) => item.score === null || item.score >= pref.minMatch);
    return { resumeStatus: 'none', tiers: groupIntoTiers(items, now) };
  }

  /**
   * One listing in full (R8). Malformed, unknown and restricted ids are all 404.
   * The stored HTML is sanitized again on read: idempotent, and it guards
   * against rows edited outside ingestion.
   */
  async getDetail(id: string): Promise<ListingDetail> {
    const doc = await this.reader.findDetail(id);
    if (!doc) throw new NotFoundException('Listing not found');
    return toListingDetail(doc);
  }

  /** The resume skill set; null (every score null) when it can't be read, so the feed stays 200. */
  private async readResumeSkills(): Promise<ReadonlySet<string> | null> {
    try {
      return await this.resume.resumeSkillSet();
    } catch (err) {
      this.logger.warn(`Could not read the resume skill set, scoring with none: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /** The active preference; the defaults when it can't be read, so the feed stays 200. */
  private async readPreference(): Promise<Preference> {
    try {
      return await this.preference.get();
    } catch (err) {
      this.logger.warn(`Could not read the preference, using defaults: ${err instanceof Error ? err.message : String(err)}`);
      return DEFAULT_PREFERENCE;
    }
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

export function toListingDetail(doc: DetailListing): ListingDetail {
  return {
    id: doc._id.toString(),
    source: SourceId.parse(doc.source),
    title: doc.title,
    company: doc.company,
    url: doc.url,
    locationText: doc.locationText ?? null,
    effectiveDate: new Date(doc.effectiveDate).toISOString(),
    eligibility: doc.eligibility ?? 'unknown',
    descriptionHtml: sanitizeHtml(doc.descriptionHtml ?? ''),
    postedAt: doc.postedAt ? new Date(doc.postedAt).toISOString() : null,
    firstSeenAt: new Date(doc.firstSeenAt).toISOString(),
  };
}
