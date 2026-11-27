import { HttpStatus, type ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Model } from 'mongoose';
import { FeedResponse } from '@ai-job-search/shared';
import { ErrorEnvelopeFilter } from '../common/error-envelope.filter.js';
import type { Listing } from '../ingestion/listing.schema.js';
import { ListingsReader, type StoredListing } from '../ingestion/listings-reader.js';
import { ListingsService } from './listings.service.js';

function stored(id: string, effectiveDate: string, eligibility: StoredListing['eligibility'] = 'worldwide'): StoredListing {
  return {
    _id: { toString: () => id },
    source: 'remotive',
    sourceJobId: id,
    url: `https://remotive.com/remote-jobs/x-${id}`,
    title: `Job ${id}`,
    company: 'Acme',
    descriptionHtml: '',
    locationText: null,
    locationTags: [],
    postedAt: null,
    firstSeenAt: new Date(effectiveDate),
    effectiveDate: new Date(effectiveDate),
    lastSeenAt: new Date(effectiveDate),
    eligibility,
    rulesHash: 'h',
  };
}

const NOW = new Date('2026-11-27T12:00:00.000Z');

function serviceOver(docs: StoredListing[]) {
  const sort = vi.fn();
  const chain = { sort, lean: () => chain, exec: async () => docs };
  sort.mockReturnValue(chain);
  const find = vi.fn(() => chain);
  const model = { find } as unknown as Model<Listing>;
  return { service: new ListingsService(new ListingsReader(model)), find, sort };
}

const allItems = (feed: FeedResponse) => [...feed.tiers.fresh, ...feed.tiers.recent, ...feed.tiers.older];

describe('feed read', () => {
  it('groups listings into freshness tiers with resumeStatus none and ISO dates', async () => {
    const { service, sort } = serviceOver([
      stored('fresh', '2026-11-27T10:00:00.000Z'), // now − 2h
      stored('recent', '2026-11-26T06:00:00.000Z'), // now − 30h
      stored('older', '2026-11-22T12:00:00.000Z'), // now − 5d
    ]);

    const feed = await service.getFeed(NOW);

    expect(sort).toHaveBeenCalledWith({ effectiveDate: -1, _id: -1 });
    expect(FeedResponse.safeParse(feed).success).toBe(true);
    expect(feed.resumeStatus).toBe('none');
    expect(feed.tiers.fresh.map((i) => i.id)).toEqual(['fresh']);
    expect(feed.tiers.recent.map((i) => i.id)).toEqual(['recent']);
    expect(feed.tiers.older.map((i) => i.id)).toEqual(['older']);
    expect(feed.tiers.fresh[0]!.effectiveDate).toBe('2026-11-27T10:00:00.000Z');
  });

  it('returns three empty tiers for an empty database', async () => {
    const feed = await serviceOver([]).service.getFeed(NOW);

    expect(feed).toEqual({ resumeStatus: 'none', tiers: { fresh: [], recent: [], older: [] } });
  });

  it('excludes restricted listings in the query and carries each item\'s eligibility', async () => {
    const legacy = { ...stored('d', '2026-11-23T00:00:00.000Z'), eligibility: undefined } as unknown as StoredListing;
    const docs = [
      stored('a', '2026-11-26T00:00:00.000Z', 'worldwide'),
      stored('b', '2026-11-25T00:00:00.000Z', 'apac'),
      stored('c', '2026-11-24T00:00:00.000Z', 'ph-friendly'),
      stored('e', '2026-11-22T00:00:00.000Z', 'unknown'),
      legacy,
    ];
    const { service, find } = serviceOver(docs);

    const feed = await service.getFeed(NOW);

    expect(find).toHaveBeenCalledWith({ eligibility: { $ne: 'restricted' } }, expect.objectContaining({ descriptionHtml: 0 }));
    expect(FeedResponse.safeParse(feed).success).toBe(true);
    expect(allItems(feed).map((i) => i.eligibility)).toEqual(['worldwide', 'apac', 'ph-friendly', 'unknown', 'unknown']);
  });

  it('turns a database error into a 500 error envelope', () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const host = { switchToHttp: () => ({ getResponse: () => ({ status }) }) } as unknown as ArgumentsHost;

    new ErrorEnvelopeFilter().catch(new Error('connection refused'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({ error: { code: 'internal_error', message: 'Internal server error' } });
  });
});
