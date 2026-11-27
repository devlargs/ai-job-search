import { describe, expect, it, vi } from 'vitest';
import type { Eligibility, ListingDraft, SourceId } from '@ai-job-search/shared';
import type { Model } from 'mongoose';
import { MatchingRules } from '../matching/matching.module.js';
import { loadMatchingRules } from '../matching/rules.js';
import type { JobSource } from '../sources/job-source.port.js';
import { IngestionService } from './ingestion.service.js';
import type { Listing } from './listing.schema.js';
import type { SourceRun } from './source-run.schema.js';

const loaded = loadMatchingRules();
const rules = new MatchingRules(loaded.eligibility, loaded.hash);

type StoredRow = Partial<Listing> & { _id: string };

/** In-memory stand-ins for the two Mongoose models, covering only what the service calls. */
function fakeModels(existingRuns: SourceRun[] = [], storedListings: StoredRow[] = []) {
  const runs: SourceRun[] = [...existingRuns];
  const bulkWrite = vi.fn(async (_ops: unknown[]) => ({}));
  const find = vi.fn((filter: { rulesHash: { $ne: string } }) => {
    const rows = storedListings.filter((row) => row.rulesHash !== filter.rulesHash.$ne);
    const chain = {
      lean: () => chain,
      cursor: () =>
        (async function* () {
          yield* rows;
        })(),
    };
    return chain;
  });
  const listings = { bulkWrite, find } as unknown as Model<Listing>;
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
  return { listings, runModel, runs, bulkWrite, find };
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

function fakeSource(id: string, fetch: JobSource['fetch'], minIntervalMin?: number, eligibilityHint?: Eligibility): JobSource {
  return { id: id as SourceId, minIntervalMin, eligibilityHint, fetch: vi.fn(fetch) };
}

type UpsertOps = Array<{
  updateOne: { filter: unknown; upsert: boolean; update: { $setOnInsert: Record<string, unknown>; $set: Record<string, unknown> } };
}>;

/** The upsert batch the given run wrote, skipping any re-tag batches. */
function upsertCall(bulkWrite: ReturnType<typeof fakeModels>['bulkWrite'], index = 0): UpsertOps {
  const calls = bulkWrite.mock.calls
    .map((c) => c[0] as UpsertOps)
    .filter((ops) => ops.some((op) => op.updateOne.upsert));
  return calls[index]!;
}

describe('IngestionService', () => {
  it('records a failing source as ok:false while other sources continue', async () => {
    const m = fakeModels();
    const broken = fakeSource('broken', async () => {
      throw new Error('boom');
    });
    const good = fakeSource('remotive', async () => [draft()]);
    const service = new IngestionService([broken, good], m.listings, m.runModel, rules);

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
    const service = new IngestionService([source], m.listings, m.runModel, rules);

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
    const service = new IngestionService([source], m.listings, m.runModel, rules);

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
    const service = new IngestionService([source], m.listings, m.runModel, rules);

    await service.run();

    expect(source.fetch).toHaveBeenCalledWith(old.startedAt);
  });

  it('skips invalid drafts and counts only the valid ones', async () => {
    const m = fakeModels();
    const source = fakeSource('remotive', async () => [
      draft({ sourceJobId: 'a' }),
      draft({ sourceJobId: 'b', url: '/relative/path' }),
    ]);
    const service = new IngestionService([source], m.listings, m.runModel, rules);

    const summary = await service.run();

    expect(summary.outcomes[0]).toEqual({ source: 'remotive', status: 'ok', count: 1, invalid: 1 });
    const ops = upsertCall(m.bulkWrite);
    expect(ops).toHaveLength(1);
    expect(ops[0]!.updateOne.filter).toEqual({ source: 'remotive', sourceJobId: 'a' });
  });

  it('upserts with $setOnInsert for the three dates and $set for the rest, sanitized and tagged', async () => {
    const m = fakeModels();
    const postedAt = new Date('2026-11-20T00:00:00.000Z');
    const source = fakeSource('remotive', async () => [draft({ postedAt })]);
    const service = new IngestionService([source], m.listings, m.runModel, rules);

    await service.run();

    const ops = upsertCall(m.bulkWrite);
    const { upsert, update } = ops[0]!.updateOne;
    expect(upsert).toBe(true);
    expect(Object.keys(update.$setOnInsert).sort()).toEqual(['effectiveDate', 'firstSeenAt', 'postedAt']);
    expect(update.$setOnInsert.postedAt).toEqual(postedAt);
    expect(update.$setOnInsert.effectiveDate).toEqual(postedAt);
    expect(update.$setOnInsert.firstSeenAt).toBeInstanceOf(Date);
    expect(Object.keys(update.$set).sort()).toEqual(
      ['company', 'descriptionHtml', 'eligibility', 'lastSeenAt', 'locationTags', 'locationText', 'rulesHash', 'title', 'url'].sort(),
    );
    expect(update.$set.eligibility).toBe('worldwide');
    expect(update.$set.rulesHash).toBe(rules.hash);
    expect(update.$set.lastSeenAt).toEqual(update.$setOnInsert.firstSeenAt);
    expect(update.$set.descriptionHtml).toBe('<p>Hello</p>');
  });

  it('uses firstSeenAt as effectiveDate when postedAt is in the future', async () => {
    const m = fakeModels();
    const source = fakeSource('remotive', async () => [draft({ postedAt: new Date(Date.now() + 60 * 60_000) })]);
    const service = new IngestionService([source], m.listings, m.runModel, rules);

    await service.run();

    const ops = upsertCall(m.bulkWrite);
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
    const service = new IngestionService([source], m.listings, m.runModel, rules);

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
  it('tags at ingest from the location, then the source hint, then the description text', async () => {
    const m = fakeModels();
    const source = fakeSource(
      'remotive',
      async () => [
        draft({ sourceJobId: 'loc', locationText: 'USA, Canada' }),
        draft({ sourceJobId: 'hint', locationText: null, descriptionHtml: '<p>Must be based in the US</p>' }),
      ],
      undefined,
      'ph-friendly',
    );
    const service = new IngestionService([source], m.listings, m.runModel, rules);

    await service.run();

    const tags = upsertCall(m.bulkWrite).map((op) => op.updateOne.update.$set.eligibility);
    expect(tags).toEqual(['restricted', 'ph-friendly']);
  });

  it('reads description phrases from the sanitized text when there is no location or hint', async () => {
    const m = fakeModels();
    const source = fakeSource('remotive', async () => [
      draft({ locationText: null, descriptionHtml: '<ul><li>Remote</li><li>Candidates <b>must be based in</b> the United States</li></ul>' }),
    ]);
    const service = new IngestionService([source], m.listings, m.runModel, rules);

    await service.run();

    expect(upsertCall(m.bulkWrite)[0]!.updateOne.update.$set.eligibility).toBe('restricted');
  });

  it('re-tags at boot the rows with a stale or missing rulesHash and leaves current ones alone', async () => {
    const m = fakeModels(
      [],
      [
        { _id: 'stale', source: 'remotive', locationText: 'US Only', locationTags: [], descriptionHtml: '', rulesHash: 'old' },
        { _id: 'legacy', source: 'remotive', locationText: 'Worldwide', locationTags: [], descriptionHtml: '' },
        { _id: 'current', source: 'remotive', locationText: 'APAC', locationTags: [], descriptionHtml: '', rulesHash: rules.hash },
      ],
    );
    const service = new IngestionService([fakeSource('remotive', async () => [])], m.listings, m.runModel, rules);

    await service.run();

    expect(m.find).toHaveBeenCalledWith({ rulesHash: { $ne: rules.hash } }, expect.anything());
    const retag = m.bulkWrite.mock.calls[0]![0] as Array<{ updateOne: { filter: { _id: string }; update: { $set: Record<string, unknown> } } }>;
    expect(retag.map((op) => [op.updateOne.filter._id, op.updateOne.update.$set])).toEqual([
      ['stale', { eligibility: 'restricted', rulesHash: rules.hash }],
      ['legacy', { eligibility: 'worldwide', rulesHash: rules.hash }],
    ]);
  });

  it('uses the source hint when re-tagging a stored row', async () => {
    const m = fakeModels([], [{ _id: 'x', source: 'remotive', locationText: null, locationTags: [], descriptionHtml: '' }]);
    const service = new IngestionService(
      [fakeSource('remotive', async () => [], undefined, 'ph-friendly')],
      m.listings,
      m.runModel,
      rules,
    );

    const summary = await service.retagIfRulesChanged();

    expect(summary).toEqual({ retagged: 1, failed: 0 });
    const retag = m.bulkWrite.mock.calls[0]![0] as Array<{ updateOne: { update: { $set: Record<string, unknown> } } }>;
    expect(retag[0]!.updateOne.update.$set.eligibility).toBe('ph-friendly');
  });

  it('logs a failed re-tag batch without failing the run', async () => {
    const m = fakeModels([], [{ _id: 'x', source: 'remotive', locationText: 'Worldwide', locationTags: [], descriptionHtml: '' }]);
    m.bulkWrite.mockRejectedValueOnce(new Error('write conflict'));
    const source = fakeSource('remotive', async () => [draft()]);
    const service = new IngestionService([source], m.listings, m.runModel, rules);

    const summary = await service.run();

    expect(summary.outcomes[0]).toMatchObject({ status: 'ok', count: 1 });
    expect(source.fetch).toHaveBeenCalledOnce();
  });

  it('re-tags only on the first run, ahead of any fetch', async () => {
    const m = fakeModels([], [{ _id: 'x', source: 'remotive', locationText: 'Worldwide', locationTags: [], descriptionHtml: '' }]);
    const order: string[] = [];
    m.find.mockImplementation(((filter: { rulesHash: { $ne: string } }) => {
      order.push('retag');
      const chain = { lean: () => chain, cursor: () => (async function* () {})() };
      void filter;
      return chain;
    }) as never);
    const source = fakeSource('remotive', async () => {
      order.push('fetch');
      return [];
    });
    const service = new IngestionService([source], m.listings, m.runModel, rules);

    await service.run();
    await service.run();

    expect(order).toEqual(['retag', 'fetch', 'fetch']);
    expect(m.find).toHaveBeenCalledOnce();
  });
});
