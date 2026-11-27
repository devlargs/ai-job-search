import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ListingDraft } from '@ai-job-search/shared';
import { JOBICY_URL, JobicyAdapter } from './jobicy.adapter.js';

const fixture = JSON.parse(
  readFileSync(new URL('./__fixtures__/jobicy.json', import.meta.url), 'utf8'),
) as { jobs: Array<Record<string, unknown>> };

function adapterWith(body: string, status = 200) {
  const fetchFn = vi.fn(async () => new Response(body, { status, headers: { 'Content-Type': 'application/json' } }));
  return { adapter: new JobicyAdapter(JOBICY_URL, fetchFn as unknown as typeof fetch), fetchFn };
}

describe('JobicyAdapter', () => {
  it('declares the jobicy id and a 30 min throttle', () => {
    const { adapter } = adapterWith('{}');
    expect(adapter.id).toBe('jobicy');
    expect(adapter.minIntervalMin).toBe(30);
  });

  it('maps the fixture to valid drafts', async () => {
    const { adapter, fetchFn } = adapterWith(JSON.stringify(fixture));
    const drafts = await adapter.fetch(new Date('2030-01-01T00:00:00Z'));

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://jobicy.com/api/v2/remote-jobs?count=50');
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('ai-job-search-local');
    expect(init.signal).toBeInstanceOf(AbortSignal);

    expect(drafts).toHaveLength(4);
    for (const draft of drafts) expect(ListingDraft.safeParse(draft).success).toBe(true);

    const job = fixture.jobs[0]!;
    const first = drafts[0]!;
    expect(first.sourceJobId).toBe('1000');
    expect(first.url).toBe(job.url);
    expect(first.title).toBe('Senior Frontend Engineer (React)');
    expect(first.company).toBe('Acme Remote Co');
    expect(first.descriptionHtml).toBe(job.jobDescription);
    expect(first.locationTags).toEqual([]);
    expect(first.postedAt?.toISOString()).toBe('2026-11-27T09:30:07.000Z');
    expect(drafts.map((d) => d.locationText)).toEqual(['USA', 'Poland,  UK,  USA', 'Australia,  New Zealand', 'Philippines']);
  });

  it('skips a malformed item and keeps the rest', async () => {
    const body = { ...fixture, jobs: [{ id: 1, url: '' }, 7, fixture.jobs[3]] };
    const drafts = await adapterWith(JSON.stringify(body)).adapter.fetch(null);
    expect(drafts.map((d) => d.sourceJobId)).toEqual(['1003']);
  });

  it.each([429, 500])('throws with the board name and status on %i', async (status) => {
    await expect(adapterWith('{}', status).adapter.fetch(null)).rejects.toThrow(new RegExp(`Jobicy.*${status}`));
  });

  it('throws when the jobs array is missing', async () => {
    await expect(adapterWith('{"jobCount":0}').adapter.fetch(null)).rejects.toThrow(/jobs/);
  });

  it('throws when the body is not JSON', async () => {
    await expect(adapterWith('oops').adapter.fetch(null)).rejects.toThrow(/Jobicy/);
  });
});
