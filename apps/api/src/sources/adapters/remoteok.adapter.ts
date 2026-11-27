import type { ListingDraft, SourceId } from '@ai-job-search/shared';
import type { JobSource } from '../job-source.port.js';
import { getBoardJson, idString, isRecord, parseDate, str, type FetchFn } from './board-fetch.js';

export const REMOTEOK_URL = 'https://remoteok.com/api';

/**
 * Remote OK public API. Terms (element 0 of the response): link back to the
 * job's Remote OK url and name "Remote OK" as the source; no logo.
 * The API returns its current ~100 jobs with no paging, so every run takes the
 * whole window and `since` is ignored (pruning relies on lastSeenAt staying fresh).
 */
export class RemoteOkAdapter implements JobSource {
  readonly id: SourceId = 'remoteok';
  readonly minIntervalMin = 60;

  constructor(
    private readonly url: string = REMOTEOK_URL,
    private readonly fetchFn: FetchFn = globalThis.fetch.bind(globalThis),
  ) {}

  async fetch(_since: Date | null): Promise<ListingDraft[]> {
    const body = await getBoardJson(this.fetchFn, this.url, 'Remote OK');
    if (!Array.isArray(body)) {
      throw new Error('Remote OK response is not an array');
    }
    // Element 0 is the legal notice, not a job; it has no id or url, so toDraft skips it.
    return body.flatMap((job) => {
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
  const location = str(job.location);
  return {
    sourceJobId,
    url,
    title: str(job.position),
    company: str(job.company),
    descriptionHtml: typeof job.description === 'string' ? job.description : '',
    locationText: location === '' ? null : location,
    locationTags: [],
    postedAt: parseDate(job.date),
  };
}
