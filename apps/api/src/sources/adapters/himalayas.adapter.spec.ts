import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ListingDraft } from '@ai-job-search/shared';
import { HIMALAYAS_MAX_PAGES, HIMALAYAS_URL, HimalayasAdapter } from './himalayas.adapter.js';

const fixture = JSON.parse(
  readFileSync(new URL('./__fixtures__/himalayas.json', import.meta.url), 'utf8'),
) as { nextCursor: string; jobs: Array<Record<string, unknown>> };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function adapterWithPages(pages: Array<() => Response>) {
  let i = 0;
  const fetchFn = vi.fn(async () => pages[Math.min(i++, pages.length - 1)]!());
  return { adapter: new HimalayasAdapter(HIMALAYAS_URL, fetchFn as unknown as typeof fetch), fetchFn };
}

const lastPage = { ...fixture, nextCursor: null };

describe('HimalayasAdapter', () => {
  it('declares the himalayas id and a 30 min throttle', () => {
    const { adapter } = adapterWithPages([() => json(lastPage)]);
    expect(adapter.id).toBe('himalayas');
    expect(adapter.minIntervalMin).toBe(30);
  });

  it('maps the fixture to valid drafts', async () => {
    const { adapter, fetchFn } = adapterWithPages([() => json(lastPage)]);
    const drafts = await adapter.fetch(new Date('2030-01-01T00:00:00Z'));

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://himalayas.app/jobs/api?limit=20');
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('ai-job-search-local');
    expect(init.signal).toBeInstanceOf(AbortSignal);

    expect(drafts).toHaveLength(4);
    for (const draft of drafts) expect(ListingDraft.safeParse(draft).success).toBe(true);

    const job = fixture.jobs[0]!;
    const first = drafts[0]!;
    expect(first.sourceJobId).toBe(job.guid);
    expect(first.url).toBe(job.applicationLink); // unchanged, utm included
    expect(first.title).toBe('Senior Frontend Engineer (React)');
    expect(first.company).toBe('Acme Remote Co');
    expect(first.descriptionHtml).toBe(job.description);
    expect(first.locationText).toBeNull();
    expect(first.locationTags).toEqual(job.locationRestrictions);
    expect(first.postedAt?.getTime()).toBe((job.pubDate as number) * 1000);
  });

  it('follows nextCursor to a second page', async () => {
    const page2 = { ...lastPage, jobs: [{ ...fixture.jobs[0], guid: 'https://himalayas.app/jobs/p2' }] };
    const { adapter, fetchFn } = adapterWithPages([() => json(fixture), () => json(page2)]);
    const drafts = await adapter.fetch(null);

    expect(fetchFn).toHaveBeenCalledTimes(2);
    const secondUrl = new URL((fetchFn.mock.calls[1] as unknown as [string])[0]);
    expect(secondUrl.searchParams.get('limit')).toBe('20');
    expect(secondUrl.searchParams.get('cursor')).toBe(fixture.nextCursor);
    expect(drafts).toHaveLength(5);
    expect(drafts[4]!.sourceJobId).toBe('https://himalayas.app/jobs/p2');
  });

  it(`stops after ${HIMALAYAS_MAX_PAGES} pages when every page has a cursor`, async () => {
    const { adapter, fetchFn } = adapterWithPages([() => json(fixture)]);
    const drafts = await adapter.fetch(null);
    expect(HIMALAYAS_MAX_PAGES).toBe(5);
    expect(fetchFn).toHaveBeenCalledTimes(5);
    expect(drafts).toHaveLength(20);
  });

  it('skips a malformed item and keeps the rest', async () => {
    const body = { ...lastPage, jobs: [null, { title: 'no guid' }, fixture.jobs[1]] };
    const drafts = await adapterWithPages([() => json(body)]).adapter.fetch(null);
    expect(drafts).toHaveLength(1);
  });

  it('maps a missing pubDate to null', async () => {
    const body = { ...lastPage, jobs: [{ ...fixture.jobs[0], pubDate: null }] };
    const [draft] = await adapterWithPages([() => json(body)]).adapter.fetch(null);
    expect(draft!.postedAt).toBeNull();
  });

  it.each([429, 500])('throws with the board name and status on %i', async (status) => {
    const { adapter } = adapterWithPages([() => json({}, status)]);
    await expect(adapter.fetch(null)).rejects.toThrow(new RegExp(`Himalayas.*${status}`));
  });

  it('throws when the jobs array is missing', async () => {
    await expect(adapterWithPages([() => json({ totalCount: 0 })]).adapter.fetch(null)).rejects.toThrow(/jobs/);
  });

  it('throws when a later page fails', async () => {
    const { adapter } = adapterWithPages([() => json(fixture), () => json({}, 500)]);
    await expect(adapter.fetch(null)).rejects.toThrow(/500/);
  });
});
