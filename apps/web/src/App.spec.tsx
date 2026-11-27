import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { FeedItem, SourceId } from '@ai-job-search/shared';
import { ListingRow, listingIdFromHash } from './App.js';

function item(source: SourceId): FeedItem {
  return {
    id: 'abc123',
    source,
    title: 'Frontend Engineer',
    company: 'Acme',
    url: 'https://example.com/jobs/abc123',
    locationText: null,
    effectiveDate: '2026-11-27T10:00:00.000Z',
    eligibility: 'worldwide',
    score: null,
  };
}

describe('ListingRow', () => {
  it.each<[SourceId, string]>([
    ['remotive', 'Remotive'],
    ['remoteok', 'Remote OK'],
    ['we-work-remotely', 'We Work Remotely'],
    ['himalayas', 'Himalayas'],
    ['jobicy', 'Jobicy'],
  ])('shows "via <label>" for %s', (source, label) => {
    const html = renderToStaticMarkup(<ListingRow item={item(source)} />);
    expect(html).toContain(`<span class="source">via ${label}</span>`);
    expect(html).toContain('href="#/listings/abc123"');
  });
});

describe('listingIdFromHash', () => {
  it.each([
    ['#/listings/abc123', 'abc123'],
    ['#/listings/abc123/', 'abc123'],
    ['#/listings/abc123?x', 'abc123'],
  ])('reads the id from %s', (hash, id) => {
    expect(listingIdFromHash(hash)).toBe(id);
  });

  it.each(['', '#', '#/', '#/listings', '#/listings/', '#/listings//abc', '#/other/abc123', 'listings/abc123', '/#/listings/abc123'])(
    'rejects %j',
    (hash) => {
      expect(listingIdFromHash(hash)).toBeNull();
    },
  );
});
