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

describe('feed read', () => {
  it('queries listings newest effectiveDate first and returns ISO dates', async () => {
    const docs = [stored('b', '2026-11-26T00:00:00.000Z'), stored('a', '2026-11-20T00:00:00.000Z')];
    const sort = vi.fn();
    const chain = { sort, lean: () => chain, exec: async () => docs };
    sort.mockReturnValue(chain);
    const model = { find: vi.fn(() => chain) } as unknown as Model<Listing>;

    const feed = await new ListingsService(new ListingsReader(model)).getFeed();

    expect(sort).toHaveBeenCalledWith({ effectiveDate: -1, _id: -1 });
    expect(FeedResponse.safeParse(feed).success).toBe(true);
    expect(feed.items.map((i) => i.id)).toEqual(['b', 'a']);
    expect(feed.items[0]!.effectiveDate).toBe('2026-11-26T00:00:00.000Z');
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
    const chain = { sort: () => chain, lean: () => chain, exec: async () => docs };
    const find = vi.fn(() => chain);
    const model = { find } as unknown as Model<Listing>;

    const feed = await new ListingsService(new ListingsReader(model)).getFeed();

    expect(find).toHaveBeenCalledWith({ eligibility: { $ne: 'restricted' } }, expect.objectContaining({ descriptionHtml: 0 }));
    expect(FeedResponse.safeParse(feed).success).toBe(true);
    expect(feed.items.map((i) => i.eligibility)).toEqual(['worldwide', 'apac', 'ph-friendly', 'unknown', 'unknown']);
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
