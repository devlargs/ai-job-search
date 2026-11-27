import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ListingDraft } from '@ai-job-search/shared';
import { REMOTEOK_URL, RemoteOkAdapter } from './remoteok.adapter.js';

const fixture = JSON.parse(
  readFileSync(new URL('./__fixtures__/remoteok.json', import.meta.url), 'utf8'),
) as Array<Record<string, unknown>>;

function adapterWith(body: string, status = 200) {
  const fetchFn = vi.fn(async () => new Response(body, { status, headers: { 'Content-Type': 'application/json' } }));
  return { adapter: new RemoteOkAdapter(REMOTEOK_URL, fetchFn as unknown as typeof fetch), fetchFn };
}

describe('RemoteOkAdapter', () => {
  it('declares the remoteok id and a 60 min throttle', () => {
    const { adapter } = adapterWith('[]');
    expect(adapter.id).toBe('remoteok');
    expect(adapter.minIntervalMin).toBe(60);
  });

  it('maps the fixture to valid drafts, skipping the legal element', async () => {
    const { adapter, fetchFn } = adapterWith(JSON.stringify(fixture));
    const drafts = await adapter.fetch(new Date('2030-01-01T00:00:00Z')); // since is ignored

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://remoteok.com/api');
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('ai-job-search-local');
    expect(init.signal).toBeInstanceOf(AbortSignal);

    expect(drafts).toHaveLength(4);
    for (const draft of drafts) expect(ListingDraft.safeParse(draft).success).toBe(true);

    const job = fixture[1]!;
    const first = drafts[0]!;
    expect(first.sourceJobId).toBe('1000');
    expect(first.url).toBe(job.url);
    expect(first.title).toBe('Senior Frontend Engineer (React)');
    expect(first.company).toBe('Acme Remote Co');
    expect(first.descriptionHtml).toBe(job.description);
    expect(first.locationText).toBe('Worldwide');
    expect(first.locationTags).toEqual([]);
    expect(first.postedAt?.toISOString()).toBe('2026-11-24T10:40:03.000Z');
    expect(drafts.map((d) => d.locationText)).toEqual(['Worldwide', 'Asia', 'US Only', null]);
  });

  it('skips a malformed item and keeps the rest', async () => {
    const body = [fixture[0], { id: '' }, 'junk', fixture[1]];
    const { adapter } = adapterWith(JSON.stringify(body));
    const drafts = await adapter.fetch(null);
    expect(drafts.map((d) => d.sourceJobId)).toEqual(['1000']);
  });

  it.each([429, 500])('throws with the board name and status on %i', async (status) => {
    const { adapter } = adapterWith('{}', status);
    await expect(adapter.fetch(null)).rejects.toThrow(new RegExp(`Remote OK.*${status}`));
  });

  it('throws when the body is not an array', async () => {
    await expect(adapterWith('{"jobs":[]}').adapter.fetch(null)).rejects.toThrow(/Remote OK/);
  });

  it('throws when the body is not JSON', async () => {
    await expect(adapterWith('<html>').adapter.fetch(null)).rejects.toThrow(/Remote OK/);
  });
});
