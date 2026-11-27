import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ListingDraft } from '@ai-job-search/shared';
import type { AnyBulkWriteOperation, Model } from 'mongoose';
import { JOB_SOURCES, type JobSource } from '../sources/job-source.port.js';
import { effectiveDate } from './effective-date.js';
import { Listing } from './listing.schema.js';
import { sanitizeHtml } from './sanitize-html.js';
import { SourceRun } from './source-run.schema.js';

export type SourceOutcome =
  | { source: string; status: 'ok'; count: number; invalid: number }
  | { source: string; status: 'failed'; error: string }
  | { source: string; status: 'throttled' };

export interface RunSummary {
  skipped: boolean;
  outcomes: SourceOutcome[];
}

/**
 * The ingestion pipeline (AD-3) and the only writer of `listings`.
 * Per source: throttle check -> fetch -> validate -> sanitize -> upsert -> source_runs.
 * Runs are single-flight (AD-1): a run requested while one is in progress is skipped.
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger('Ingestion');
  private running = false;

  constructor(
    @Inject(JOB_SOURCES) private readonly sources: JobSource[],
    @InjectModel(Listing.name) private readonly listings: Model<Listing>,
    @InjectModel(SourceRun.name) private readonly runs: Model<SourceRun>,
  ) {}

  async run(): Promise<RunSummary> {
    if (this.running) {
      this.logger.log('Fetch run skipped: previous run still in progress');
      return { skipped: true, outcomes: [] };
    }
    this.running = true;
    const startedAt = Date.now();
    try {
      const outcomes: SourceOutcome[] = [];
      for (const source of this.sources) {
        outcomes.push(await this.runSource(source));
      }
      this.logger.log(`Fetch run finished in ${Date.now() - startedAt} ms: ${outcomes.map(describe).join('; ') || 'no sources'}`);
      return { skipped: false, outcomes };
    } finally {
      this.running = false;
    }
  }

  private async runSource(source: JobSource): Promise<SourceOutcome> {
    const now = new Date();
    try {
      // Throttle on the latest run of any outcome, so a failing or blocking source is not re-requested every tick.
      if (source.minIntervalMin) {
        const lastRun = await this.runs.findOne({ source: source.id }).sort({ startedAt: -1 }).lean().exec();
        if (lastRun && now.getTime() - lastRun.startedAt.getTime() < source.minIntervalMin * 60_000) {
          return { source: source.id, status: 'throttled' };
        }
      }

      const lastOk = await this.runs
        .findOne({ source: source.id, ok: true })
        .sort({ startedAt: -1 })
        .lean()
        .exec();
      const lastSuccessAt = lastOk?.startedAt ?? null;

      const raw = await source.fetch(lastSuccessAt);
      const ops: AnyBulkWriteOperation<Listing>[] = [];
      let invalid = 0;
      for (const item of raw) {
        const parsed = ListingDraft.safeParse(item);
        if (!parsed.success) {
          invalid++;
          continue;
        }
        ops.push(upsertOp(source.id, parsed.data, now));
      }
      if (ops.length > 0) {
        await this.listings.bulkWrite(ops, { ordered: false });
      }
      await this.recordRun({ source: source.id, startedAt: now, finishedAt: new Date(), ok: true, count: ops.length, error: null });
      return { source: source.id, status: 'ok', count: ops.length, invalid };
    } catch (err) {
      const error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      await this.recordRun({ source: source.id, startedAt: now, finishedAt: new Date(), ok: false, count: 0, error });
      return { source: source.id, status: 'failed', error };
    }
  }

  private async recordRun(run: SourceRun): Promise<void> {
    try {
      await this.runs.create(run);
    } catch (err) {
      this.logger.error(`Could not record source run for ${run.source}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

/** AD-3 upsert: the three dates are fixed at insert, everything else is refreshed. */
export function upsertOp(source: string, draft: ListingDraft, now: Date): AnyBulkWriteOperation<Listing> {
  return {
    updateOne: {
      filter: { source, sourceJobId: draft.sourceJobId },
      upsert: true,
      update: {
        $setOnInsert: {
          firstSeenAt: now,
          postedAt: draft.postedAt,
          effectiveDate: effectiveDate(draft.postedAt, now, now),
        },
        $set: {
          title: draft.title,
          company: draft.company,
          descriptionHtml: sanitizeHtml(draft.descriptionHtml),
          url: draft.url,
          locationText: draft.locationText,
          locationTags: draft.locationTags,
          lastSeenAt: now,
        },
      },
    },
  };
}

function describe(o: SourceOutcome): string {
  switch (o.status) {
    case 'ok':
      return `${o.source} ok, ${o.count} upserted${o.invalid ? `, ${o.invalid} invalid skipped` : ''}`;
    case 'failed':
      return `${o.source} failed (${o.error})`;
    case 'throttled':
      return `${o.source} skipped (throttled)`;
  }
}
