import type { ListingDraft, SourceId } from '@ai-job-search/shared';
import type { JobSource } from '../job-source.port.js';
import { getBoardJson, idString, isRecord, parseDate, str, type FetchFn } from './board-fetch.js';

export const JOBICY_URL = 'https://jobicy.com/api/v2/remote-jobs?count=50';

/**
 * Jobicy public API. Terms: credit Jobicy with a direct link, and every apply
 * button goes to the job's `url`. One unfiltered page of the newest 50 per run,
 * so eligibility tags every listing; `since` is ignored.
 */
export class JobicyAdapter implements JobSource {
  readonly id: SourceId = 'jobicy';
  readonly minIntervalMin = 30;

  constructor(
    private readonly url: string = JOBICY_URL,
    private readonly fetchFn: FetchFn = globalThis.fetch.bind(globalThis),
  ) {}

  async fetch(_since: Date | null): Promise<ListingDraft[]> {
    const body = await getBoardJson(this.fetchFn, this.url, 'Jobicy');
    if (!isRecord(body) || !Array.isArray(body.jobs)) {
      throw new Error('Jobicy response has no jobs array');
    }
    return body.jobs.flatMap((job) => {
      const draft = toDraft(job);
      return draft ? [draft] : [];
    });
  }
}

function toDraft(job: unknown): ListingDraft | null {
  if (!isRecord(job)) return null;
  const sourceJobId = idString(job.id);
  const url = str(job.url);
  if (!sourceJobId || !url) return null;
  const geo = str(job.jobGeo);
  return {
    sourceJobId,
    url,
    title: str(job.jobTitle),
    company: str(job.companyName),
    descriptionHtml: typeof job.jobDescription === 'string' ? job.jobDescription : '',
    locationText: geo === '' ? null : geo,
    locationTags: [],
    postedAt: parseDate(job.pubDate),
  };
}
