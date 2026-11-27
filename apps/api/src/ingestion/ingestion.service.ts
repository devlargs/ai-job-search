import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ListingDraft, type Eligibility } from '@ai-job-search/shared';
import type { AnyBulkWriteOperation, Model } from 'mongoose';
import { MatchingRules } from '../matching/matching.module.js';
import { tagEligibility } from '../matching/tag-eligibility.js';
import { JOB_SOURCES, type JobSource } from '../sources/job-source.port.js';
import { effectiveDate } from './effective-date.js';
import { Listing } from './listing.schema.js';
import { htmlToText, sanitizeHtml } from './sanitize-html.js';
import { SourceRun } from './source-run.schema.js';

export type SourceOutcome =
  | { source: string; status: 'ok'; count: number; invalid: number }
  | { source: string; status: 'failed'; error: string }
  | { source: string; status: 'throttled' };

export interface RunSummary {
  skipped: boolean;
  outcomes: SourceOutcome[];
}

export interface RetagSummary {
  retagged: number;
  failed: number;
}

/** Listings re-tagged per bulkWrite during the boot re-tag. */
const RETAG_BATCH = 500;

/**
 * The ingestion pipeline (AD-3) and the only writer of `listings`.
 * Per source: throttle check -> fetch -> validate -> sanitize -> derive text -> tagEligibility -> upsert -> source_runs.
 * Runs are single-flight (AD-1): a run requested while one is in progress is skipped.
 * The first run (the boot run) first re-tags stored listings whose rulesHash is not the current one.
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger('Ingestion');
  private running = false;
  private retagChecked = false;

  constructor(
    @Inject(JOB_SOURCES) private readonly sources: JobSource[],
    @InjectModel(Listing.name) private readonly listings: Model<Listing>,
    @InjectModel(SourceRun.name) private readonly runs: Model<SourceRun>,
    @Inject(MatchingRules) private readonly rules: MatchingRules,
  ) {}

  async run(): Promise<RunSummary> {
    if (this.running) {
      this.logger.log('Fetch run skipped: previous run still in progress');
      return { skipped: true, outcomes: [] };
    }
    this.running = true;
    const startedAt = Date.now();
    try {
      if (!this.retagChecked) {
        this.retagChecked = true;
        await this.retagIfRulesChanged();
      }
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
        ops.push(upsertOp(source.id, parsed.data, now, this.rules, source.eligibilityHint));
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

  /**
   * AD-3: re-derive eligibility for every stored listing whose rulesHash is not
   * the current one (a missing hash included). Streams the rows and bulk-updates
   * them in batches. A failing row or batch is logged and skipped, never fatal.
   */
  async retagIfRulesChanged(): Promise<RetagSummary> {
    const { hash } = this.rules;
    const hints = new Map(this.sources.map((s) => [s.id as string, s.eligibilityHint]));
    let retagged = 0;
    let failed = 0;
    let stoppedEarly = false;
    let batch: AnyBulkWriteOperation<Listing>[] = [];

    const flush = async (): Promise<void> => {
      if (batch.length === 0) return;
      const ops = batch;
      batch = [];
      try {
        await this.listings.bulkWrite(ops, { ordered: false });
        retagged += ops.length;
      } catch (err) {
        failed += ops.length;
        this.logger.error(`Re-tag batch of ${ops.length} failed: ${errorText(err)}`);
      }
    };

    try {
      const cursor = this.listings
        .find({ rulesHash: { $ne: hash } }, { source: 1, locationText: 1, locationTags: 1, descriptionHtml: 1 })
        .lean()
        .cursor();
      for await (const doc of cursor as AsyncIterable<Pick<Listing, 'source' | 'locationText' | 'locationTags' | 'descriptionHtml'> & { _id: unknown }>) {
        try {
          const eligibility = tagEligibility(
            {
              locationText: doc.locationText ?? null,
              locationTags: doc.locationTags ?? [],
              text: htmlToText(doc.descriptionHtml ?? ''),
              hint: hints.get(doc.source),
            },
            this.rules.eligibility,
          );
          batch.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { eligibility, rulesHash: hash } } } });
        } catch (err) {
          failed++;
          this.logger.error(`Re-tag of listing ${String(doc._id)} failed: ${errorText(err)}`);
        }
        if (batch.length >= RETAG_BATCH) await flush();
      }
      await flush();
    } catch (err) {
      stoppedEarly = true;
      this.logger.error(`Re-tag stopped early: ${errorText(err)}`);
    }

    if (stoppedEarly) {
      this.logger.error(`Re-tag incomplete for rules ${hash.slice(0, 12)}: ${retagged} re-tagged, ${failed} failed before it stopped`);
    } else if (retagged > 0 || failed > 0) {
      this.logger.log(`Re-tagged ${retagged} listings for rules ${hash.slice(0, 12)}${failed ? `, ${failed} failed` : ''}`);
    } else {
      this.logger.log(`Eligibility tags current for rules ${hash.slice(0, 12)}`);
    }
    return { retagged, failed };
  }

  private async recordRun(run: SourceRun): Promise<void> {
    try {
      await this.runs.create(run);
    } catch (err) {
      this.logger.error(`Could not record source run for ${run.source}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

/** AD-3 upsert: the three dates are fixed at insert, everything else (eligibility included) is refreshed. */
export function upsertOp(
  source: string,
  draft: ListingDraft,
  now: Date,
  rules: MatchingRules,
  hint?: Eligibility,
): AnyBulkWriteOperation<Listing> {
  const descriptionHtml = sanitizeHtml(draft.descriptionHtml);
  const eligibility = tagEligibility(
    { locationText: draft.locationText, locationTags: draft.locationTags, text: htmlToText(descriptionHtml), hint },
    rules.eligibility,
  );
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
          descriptionHtml,
          url: draft.url,
          locationText: draft.locationText,
          locationTags: draft.locationTags,
          lastSeenAt: now,
          eligibility,
          rulesHash: rules.hash,
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

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
