import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ListingDraft } from '@ai-job-search/shared';
import { splitWwrTitle, WWR_URL, WeWorkRemotelyAdapter } from './we-work-remotely.adapter.js';

const fixture = readFileSync(new URL('./__fixtures__/we-work-remotely.xml', import.meta.url), 'utf8');

function adapterWith(body: string, status = 200) {
  const fetchFn = vi.fn(async () => new Response(body, { status, headers: { 'Content-Type': 'application/rss+xml' } }));
  return { adapter: new WeWorkRemotelyAdapter(WWR_URL, fetchFn as unknown as typeof fetch), fetchFn };
}

function rss(items: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>WWR</title>${items}</channel></rss>`;
}

const oneItem = (title: string) =>
  rss(`<item><title>${title}</title><region>Anywhere in the World</region><country></country><state></state>` +
    `<description>&lt;p&gt;Hi&lt;/p&gt;</description><pubDate>Fri, 27 Nov 2026 12:35:30 +0000</pubDate>` +
    `<guid>https://weworkremotely.com/remote-jobs/x</guid><link>https://weworkremotely.com/remote-jobs/x</link></item>`);

describe('WeWorkRemotelyAdapter', () => {
  it('declares the we-work-remotely id and a 60 min throttle', () => {
    const { adapter } = adapterWith('');
    expect(adapter.id).toBe('we-work-remotely');
    expect(adapter.minIntervalMin).toBe(60);
  });

  it('maps the fixture feed to valid drafts', async () => {
    const { adapter, fetchFn } = adapterWith(fixture);
    const drafts = await adapter.fetch(new Date('2030-01-01T00:00:00Z'));

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://weworkremotely.com/remote-jobs.rss');
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('ai-job-search-local');
    expect(init.signal).toBeInstanceOf(AbortSignal);

    expect(drafts).toHaveLength(4);
    for (const draft of drafts) expect(ListingDraft.safeParse(draft).success).toBe(true);

    const first = drafts[0]!;
    expect(first.sourceJobId).toBe('https://weworkremotely.com/remote-jobs/acme-remote-co-senior-frontend-engineer-react');
    expect(first.url).toBe('https://weworkremotely.com/remote-jobs/acme-remote-co-senior-frontend-engineer-react');
    expect(first.company).toBe('Acme Remote Co');
    expect(first.title).toBe('Senior Frontend Engineer (React)');
    expect(first.descriptionHtml.startsWith('<p><strong>About the role</strong></p>')).toBe(true);
    expect(first.locationText).toBe('Anywhere in the World');
    expect(first.locationTags).toEqual([]); // the state is ignored, the country is empty
    expect(first.postedAt?.toISOString()).toBe('2026-11-27T12:35:30.000Z');
    expect(drafts.map((d) => d.locationText)).toEqual(['Anywhere in the World', 'Asia Only', 'USA Only', 'USA Only']);
  });

  it('puts a non-empty country into locationTags', async () => {
    const xml = oneItem('Acme: Dev').replace('<country></country>', '<country>Philippines</country>');
    const [draft] = await adapterWith(xml).adapter.fetch(null);
    expect(draft!.locationTags).toEqual(['Philippines']);
  });

  it('keeps a title without ": " whole, with an empty company', async () => {
    const [draft] = await adapterWith(oneItem('Engineer')).adapter.fetch(null);
    expect(draft!.company).toBe('');
    expect(draft!.title).toBe('Engineer');
  });

  it('decodes HTML entities in the description', async () => {
    const xml = oneItem('Acme: Dev').replace('&lt;p&gt;Hi&lt;/p&gt;', '&lt;p&gt;Tom &amp;amp; Jerry&lt;/p&gt;');
    const [draft] = await adapterWith(xml).adapter.fetch(null);
    expect(draft!.descriptionHtml).toBe('<p>Tom &amp; Jerry</p>');
  });

  it('returns no drafts for an empty channel', async () => {
    expect(await adapterWith(rss('')).adapter.fetch(null)).toEqual([]);
  });

  it.each([429, 500])('throws with the board name and status on %i', async (status) => {
    await expect(adapterWith('', status).adapter.fetch(null)).rejects.toThrow(new RegExp(`We Work Remotely.*${status}`));
  });

  it('throws on invalid XML', async () => {
    await expect(adapterWith('<rss><channel><item></channel>').adapter.fetch(null)).rejects.toThrow(/XML/);
  });

  it('throws when there is no RSS channel', async () => {
    await expect(adapterWith('<html><body/></html>').adapter.fetch(null)).rejects.toThrow(/channel/);
  });
});

describe('splitWwrTitle', () => {
  it('splits on the first ": " only', () => {
    expect(splitWwrTitle('Acme: Lead: Platform')).toEqual({ company: 'Acme', title: 'Lead: Platform' });
  });
});
