import { describe, expect, it, vi } from 'vitest';
import type { ListingDraft, SourceId } from '@ai-job-search/shared';
import type { Model } from 'mongoose';
import type { JobSource } from '../sources/job-source.port.js';
import { IngestionService } from './ingestion.service.js';
import type { Listing } from './listing.schema.js';
import type { SourceRun } from './source-run.schema.js';

/** In-memory stand-ins for the two Mongoose models, covering only what the service calls. */
function fakeModels(existingRuns: SourceRun[] = []) {
  const runs: SourceRun[] = [...existingRuns];
  const bulkWrite = vi.fn(async (_ops: unknown[]) => ({}));
  const listings = { bulkWrite } as unknown as Model<Listing>;
  const runModel = {
    findOne: (filter: { source: string; ok?: boolean }) => {
      const matching = runs
        .filter((r) => r.source === filter.source && (filter.ok === undefined || r.ok === filter.ok))
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
      const chain = {
        sort: () => chain,
        lean: () => chain,
        exec: async () => matching[0] ?? null,
      };
      return chain;
    },
    create: vi.fn(async (doc: SourceRun) => {
      runs.push(doc);
      return doc;
    }),
  } as unknown as Model<SourceRun>;
  return { listings, runModel, runs, bulkWrite };
}

function draft(overrides: Partial<ListingDraft> = {}): ListingDraft {
  return {
    sourceJobId: '1',
    url: 'https://remotive.com/remote-jobs/x-1',
    title: 'Engineer',
    company: 'Acme',
    descriptionHtml: '<p style="color:red">Hello</p><script>x()</script>',
    locationText: 'Worldwide',
    locationTags: [],
    postedAt: new Date('2026-11-20T00:00:00.000Z'),
    ...overrides,
  };
}

function fakeSource(id: string, fetch: JobSource['fetch'], minIntervalMin?: number): JobSource {
  return { id: id as SourceId, minIntervalMin, fetch: vi.fn(fetch) };
}

describe('IngestionService', () => {
  it('records a failing source as ok:false while other sources continue', async () => {
    const m = fakeModels();
    const broken = fakeSource('broken', async () => {
      throw new Error('boom');
    });
    const good = fakeSource('remotive', async () => [draft()]);
    const service = new IngestionService([broken, good], m.listings, m.runModel);

    const summary = await service.run();

    expect(summary.outcomes.map((o) => o.status)).toEqual(['failed', 'ok']);
    expect(m.runs).toHaveLength(2);
    expect(m.runs[0]).toMatchObject({ source: 'broken', ok: false, count: 0 });
    expect(m.runs[0]!.error).toContain('boom');
    expect(m.runs[1]).toMatchObject({ source: 'remotive', ok: true, count: 1, error: null });
    expect(m.bulkWrite).toHaveBeenCalledOnce();
  });

  it('skips a source whose last ok run is newer than minIntervalMin, without fetching', async () => {
    const recent: SourceRun = {
      source: 'remotive',
      startedAt: new Date(Date.now() - 60 * 60_000),
      finishedAt: new Date(),
      ok: true,
      count: 3,
      error: null,
    };
    const m = fakeModels([recent]);
    const source = fakeSource('remotive', async () => [draft()], 360);
    const service = new IngestionService([source], m.listings, m.runModel);

    const summary = await service.run();

    expect(summary.outcomes).toEqual([{ source: 'remotive', status: 'throttled' }]);
    expect(source.fetch).not.toHaveBeenCalled();
    expect(m.bulkWrite).not.toHaveBeenCalled();
    expect(m.runs).toHaveLength(1);
  });

  it('also throttles after a recent failed run, without fetching or recording a run', async () => {
    const failed: SourceRun = {
      source: 'remotive',
      startedAt: new Date(Date.now() - 30 * 60_000),
      finishedAt: new Date(),
      ok: false,
      count: 0,
      error: 'Error: Remotive responded 429',
    };
    const m = fakeModels([failed]);
    const source = fakeSource('remotive', async () => [draft()], 360);
    const service = new IngestionService([source], m.listings, m.runModel);

    const summary = await service.run();

    expect(summary.outcomes).toEqual([{ source: 'remotive', status: 'throttled' }]);
    expect(source.fetch).not.toHaveBeenCalled();
    expect(m.runs).toHaveLength(1);
  });

  it('fetches again once the throttle window has passed, passing lastSuccessAt as since', async () => {
    const old: SourceRun = {
      source: 'remotive',
      startedAt: new Date(Date.now() - 7 * 60 * 60_000),
      finishedAt: new Date(),
      ok: true,
      count: 3,
      error: null,
    };
    const m = fakeModels([old]);
    const source = fakeSource('remotive', async () => [draft()], 360);
    const service = new IngestionService([source], m.listings, m.runModel);

    await service.run();

    expect(source.fetch).toHaveBeenCalledWith(old.startedAt);
  });

  it('skips invalid drafts and counts only the valid ones', async () => {
    const m = fakeModels();
    const source = fakeSource('remotive', async () => [
      draft({ sourceJobId: 'a' }),
      draft({ sourceJobId: 'b', url: '/relative/path' }),
    ]);
    const service = new IngestionService([source], m.listings, m.runModel);

    const summary = await service.run();

    expect(summary.outcomes[0]).toEqual({ source: 'remotive', status: 'ok', count: 1, invalid: 1 });
    const ops = m.bulkWrite.mock.calls[0]![0] as Array<{ updateOne: { filter: unknown } }>;
    expect(ops).toHaveLength(1);
    expect(ops[0]!.updateOne.filter).toEqual({ source: 'remotive', sourceJobId: 'a' });
  });

  it('upserts with $setOnInsert for the three dates and $set for the rest, sanitized', async () => {
    const m = fakeModels();
    const postedAt = new Date('2026-11-20T00:00:00.000Z');
    const source = fakeSource('remotive', async () => [draft({ postedAt })]);
    const service = new IngestionService([source], m.listings, m.runModel);

    await service.run();

    const ops = m.bulkWrite.mock.calls[0]![0] as Array<{
      updateOne: { upsert: boolean; update: { $setOnInsert: Record<string, unknown>; $set: Record<string, unknown> } };
    }>;
    const { upsert, update } = ops[0]!.updateOne;
    expect(upsert).toBe(true);
    expect(Object.keys(update.$setOnInsert).sort()).toEqual(['effectiveDate', 'firstSeenAt', 'postedAt']);
    expect(update.$setOnInsert.postedAt).toEqual(postedAt);
    expect(update.$setOnInsert.effectiveDate).toEqual(postedAt);
    expect(update.$setOnInsert.firstSeenAt).toBeInstanceOf(Date);
    expect(Object.keys(update.$set).sort()).toEqual(
      ['company', 'descriptionHtml', 'lastSeenAt', 'locationTags', 'locationText', 'title', 'url'].sort(),
    );
    expect(update.$set.lastSeenAt).toEqual(update.$setOnInsert.firstSeenAt);
    expect(update.$set.descriptionHtml).toBe('<p>Hello</p>');
  });

  it('uses firstSeenAt as effectiveDate when postedAt is in the future', async () => {
    const m = fakeModels();
    const source = fakeSource('remotive', async () => [draft({ postedAt: new Date(Date.now() + 60 * 60_000) })]);
    const service = new IngestionService([source], m.listings, m.runModel);

    await service.run();

    const ops = m.bulkWrite.mock.calls[0]![0] as Array<{ updateOne: { update: { $setOnInsert: Record<string, Date> } } }>;
    const insert = ops[0]!.updateOne.update.$setOnInsert;
    expect(insert.effectiveDate).toEqual(insert.firstSeenAt);
  });

  it('skips a run requested while another is in progress', async () => {
    const m = fakeModels();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const source = fakeSource('remotive', async () => {
      await gate;
      return [draft()];
    });
    const service = new IngestionService([source], m.listings, m.runModel);

    const first = service.run();
    const second = await service.run();
    expect(second).toEqual({ skipped: true, outcomes: [] });

    release();
    const done = await first;
    expect(done.skipped).toBe(false);
    expect(source.fetch).toHaveBeenCalledOnce();

    // the flag is cleared afterwards, so the next run proceeds
    const third = await service.run();
    expect(third.skipped).toBe(false);
  });
});
