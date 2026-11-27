import { Injectable } from '@nestjs/common';
import { SourceId, type FeedItem, type FeedResponse } from '@ai-job-search/shared';
import { ListingsReader, type FeedListing } from '../ingestion/listings-reader.js';

@Injectable()
export class ListingsService {
  constructor(private readonly reader: ListingsReader) {}

  async getFeed(): Promise<FeedResponse> {
    const docs = await this.reader.findFeed();
    return { items: docs.map(toFeedItem) };
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
