import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ListingDetail } from '@ai-job-search/shared';
import { ListingBody } from './ListingDetailView.js';

function listing(overrides: Partial<ListingDetail> = {}): ListingDetail {
  return {
    id: 'abc123',
    source: 'we-work-remotely',
    title: 'Frontend Engineer',
    company: 'Acme',
    url: 'https://weworkremotely.com/remote-jobs/acme-frontend-engineer?ref=1&x=2',
    locationText: 'Anywhere',
    effectiveDate: '2026-11-26T10:00:00.000Z',
    eligibility: 'worldwide',
    descriptionHtml: '<p>Build <strong>things</strong>.</p><ul><li>React</li></ul>',
    postedAt: '2026-11-26T10:00:00.000Z',
    firstSeenAt: '2026-11-26T12:00:00.000Z',
    ...overrides,
  };
}

describe('ListingBody', () => {
  it('renders the description HTML as markup', () => {
    const html = renderToStaticMarkup(<ListingBody listing={listing()} />);
    expect(html).toContain('<div class="job-description"><p>Build <strong>things</strong>.</p><ul><li>React</li></ul></div>');
  });

  it('links "Apply on <board>" to the listing url in a new tab without an opener', () => {
    const html = renderToStaticMarkup(<ListingBody listing={listing()} />);
    const apply = /<a class="apply"[^>]*>[^<]*<\/a>/.exec(html)?.[0];
    expect(apply).toBeDefined();
    expect(apply).toContain('href="https://weworkremotely.com/remote-jobs/acme-frontend-engineer?ref=1&amp;x=2"');
    expect(apply).toContain('target="_blank"');
    expect(apply).toContain('rel="noopener noreferrer"');
    expect(apply).toContain('>Apply on We Work Remotely</a>');
  });

  it('shows both dates when postedAt is set', () => {
    const html = renderToStaticMarkup(<ListingBody listing={listing()} />);
    expect(html).toContain('Posted <time dateTime="2026-11-26T10:00:00.000Z">');
    expect(html).toContain('First seen <time dateTime="2026-11-26T12:00:00.000Z">');
  });

  it('shows only "First seen" when postedAt is null', () => {
    const html = renderToStaticMarkup(<ListingBody listing={listing({ postedAt: null })} />);
    expect(html).not.toContain('Posted');
    expect(html).toContain('First seen <time dateTime="2026-11-26T12:00:00.000Z">');
  });
});
