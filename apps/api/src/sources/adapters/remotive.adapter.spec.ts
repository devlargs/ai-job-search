import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ListingDraft } from '@ai-job-search/shared';
import { parseRemotiveDate, REMOTIVE_URL, RemotiveAdapter } from './remotive.adapter.js';

const fixture = JSON.parse(
  readFileSync(new URL('./__fixtures__/remotive.json', import.meta.url), 'utf8'),
) as { jobs: Array<Record<string, unknown>> };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function adapterWith(body: unknown, status = 200) {
  const fetchFn = vi.fn(async () => jsonResponse(body, status));
  return { adapter: new RemotiveAdapter(REMOTIVE_URL, fetchFn as unknown as typeof fetch), fetchFn };
}

describe('RemotiveAdapter', () => {
  it('declares the remotive id and a 360 min throttle', () => {
    const { adapter } = adapterWith(fixture);
    expect(adapter.id).toBe('remotive');
    expect(adapter.minIntervalMin).toBe(360);
  });

  it('maps the fixture payload to valid ListingDrafts', async () => {
    const { adapter, fetchFn } = adapterWith(fixture);
    const drafts = await adapter.fetch(null);

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://remotive.com/api/remote-jobs');
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('ai-job-search-local');
    expect(init.signal).toBeInstanceOf(AbortSignal);

    expect(drafts).toHaveLength(3);
    for (const draft of drafts) {
      expect(ListingDraft.safeParse(draft).success).toBe(true);
    }

    const first = drafts[0]!;
    const job = fixture.jobs[0]!;
    expect(first.sourceJobId).toBe(String(job.id));
    expect(typeof first.sourceJobId).toBe('string');
    expect(first.url).toBe(job.url);
    expect(first.title).toBe(job.title);
    expect(first.company).toBe('Creative Force'); // trailing space trimmed
    expect(first.descriptionHtml).toBe(job.description); // adapters never sanitize
    expect(first.locationText).toBe('Europe, EMEA, Germany, European timezones');
    expect(first.locationTags).toEqual([]);
    expect(first.postedAt?.toISOString()).toBe('2026-11-25T11:26:35.000Z');
  });

  it('maps an empty candidate_required_location to null', async () => {
    const job = { ...fixture.jobs[0], candidate_required_location: '' };
    const { adapter } = adapterWith({ ...fixture, jobs: [job] });
    const [draft] = await adapter.fetch(null);
    expect(draft!.locationText).toBeNull();
  });

  it('maps an unparseable publication_date to null', async () => {
    const job = { ...fixture.jobs[0], publication_date: 'not a date' };
    const { adapter } = adapterWith({ ...fixture, jobs: [job] });
    const [draft] = await adapter.fetch(null);
    expect(draft!.postedAt).toBeNull();
  });

  it('throws on a non-2xx response', async () => {
    const { adapter } = adapterWith({ error: 'nope' }, 503);
    await expect(adapter.fetch(null)).rejects.toThrow(/503/);
  });

  it('throws when the jobs array is missing', async () => {
    const { adapter } = adapterWith({ 'job-count': 0 });
    await expect(adapter.fetch(null)).rejects.toThrow(/jobs/);
  });
});

describe('parseRemotiveDate', () => {
  it('treats a zoneless timestamp as UTC', () => {
    expect(parseRemotiveDate('2026-11-25T11:26:35')?.toISOString()).toBe('2026-11-25T11:26:35.000Z');
  });

  it('respects an explicit zone', () => {
    expect(parseRemotiveDate('2026-11-25T11:26:35+02:00')?.toISOString()).toBe('2026-11-25T09:26:35.000Z');
    expect(parseRemotiveDate('2026-11-25T11:26:35Z')?.toISOString()).toBe('2026-11-25T11:26:35.000Z');
  });

  it('returns null for missing or unparseable values', () => {
    expect(parseRemotiveDate(null)).toBeNull();
    expect(parseRemotiveDate('')).toBeNull();
    expect(parseRemotiveDate('garbage')).toBeNull();
  });
});
