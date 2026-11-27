import { Injectable } from '@nestjs/common';
import { SourceId, type FeedItem, type FeedResponse } from '@ai-job-search/shared';
import { ListingsReader, type FeedListing } from '../ingestion/listings-reader.js';
import { groupIntoTiers } from './feed-tiers.js';

@Injectable()
export class ListingsService {
  constructor(private readonly reader: ListingsReader) {}

  /** The feed grouped into freshness tiers at `now`. No resume module yet, so `resumeStatus` is always `none`. */
  async getFeed(now: Date = new Date()): Promise<FeedResponse> {
    const docs = await this.reader.findFeed();
    return { resumeStatus: 'none', tiers: groupIntoTiers(docs.map(toFeedItem), now) };
  }
}

export function toFeedItem(doc: FeedListing): FeedItem {
  return {
    id: doc._id.toString(),
    source: SourceId.parse(doc.source),
    title: doc.title,
    company: doc.company,
    url: doc.url,
    locationText: doc.locationText ?? null,
    effectiveDate: new Date(doc.effectiveDate).toISOString(),
    // A row stored before tagging landed has no eligibility until the boot re-tag reaches it.
    eligibility: doc.eligibility ?? 'unknown',
  };
}
